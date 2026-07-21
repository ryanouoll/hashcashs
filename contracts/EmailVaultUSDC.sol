// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  EmailVaultUSDC
 * @notice Non-custodial USDC vault keyed by an email commitment hash.
 *
 *         Anyone can DEPOSIT USDC into a vault identified by `emailHash`.
 *         Funds can only ever LEAVE a vault when the *bound owner EOA* for that
 *         emailHash produces an EIP-712 signature authorizing the withdrawal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE NON-NEGOTIABLE INVARIANTS (do not regress these):
 *
 *   1. Funds for a given email can ONLY be moved by a signature from that
 *      email's bound owner EOA. No other party (not the bind signer, not the
 *      deployer, not a relayer, not anyone merely holding the emailHash) can
 *      move funds.  ──► enforced in `_withdraw`: ECDSA.recover(...) == ownerOf[emailHash].
 *
 *   2. There is NO owner-only / admin / deployer withdrawal path, NO
 *      pause-and-drain, NO upgradeable proxy. This contract has no owner role,
 *      no privileged address that can touch `balances`, and is not upgradeable.
 *
 *   3. The bind signer (backend attestor) may ONLY authorize the one-time
 *      binding `emailHash -> ownerAddress`. Its signature is typed under
 *      BIND_TYPEHASH and is cryptographically incapable of authorizing a
 *      withdrawal (which requires a signature under WITHDRAW_TYPEHASH recovered
 *      to `ownerOf[emailHash]`). See SECURITY NOTES for the one residual power
 *      the attestor inherently holds (binding *unclaimed* vaults).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ROLES
 *   - bindSigner (immutable): an off-chain backend that has verified, via Google
 *     OAuth, that `owner` controls the email behind `emailHash`. It signs a
 *     Bind attestation. It holds NO funds and cannot move funds in already-bound
 *     vaults. It is set once at construction and can never be changed.
 *   - owner (per emailHash): the recipient's EOA (e.g. a Privy embedded wallet
 *     derived from their Google login). Only this address's signature can
 *     withdraw from the vault. Binding is permanent and idempotent.
 *
 * GAS SPONSORSHIP
 *   `withdraw` / `bindAndWithdraw` authenticate via the *signatures* in calldata,
 *   never via `msg.sender`. A relayer (or the recipient themselves) may submit
 *   the transaction and pay gas; this does not grant the submitter any authority.
 *
 * EMAIL HASH PRIVACY
 *   The contract treats `emailHash` as an opaque bytes32 key and never computes
 *   it. Callers SHOULD pass a salted commitment, e.g.
 *       keccak256(abi.encodePacked(DOMAIN_SALT, normalize(email)))
 *   See SECURITY NOTES for residual leakage — emails are low-entropy, so any
 *   commitment derivable from the email alone is brute-forceable. A salt only
 *   namespaces hashes across deployments; it does NOT provide confidentiality.
 *
 * USDC UNITS
 *   USDC has 6 decimals. All amounts are micro-USDC: 1 USDC == 1_000_000.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY NOTES / RESIDUAL RISK
 *
 *   (A) Bind-signer compromise affects UNCLAIMED vaults only.
 *       If the bindSigner key leaks, an attacker can forge a Bind attestation for
 *       any *not-yet-bound* emailHash, binding it to an address they control, then
 *       withdraw whatever has been deposited there. This is irreducible: the
 *       backend is the email-ownership oracle, so its compromise = mis-attribution
 *       of unclaimed deposits. It CANNOT touch a vault already bound to a
 *       legitimate owner (binding is permanent; rebinding to a different address
 *       reverts). Operational mitigations live off-chain (key in HSM/KMS, per-vault
 *       caps until claimed, monitoring) and are out of scope for this contract.
 *
 *   (B) Email hash is brute-forceable. emailHash leaks which emails have vaults to
 *       anyone who can guess the plaintext (dictionary of common addresses). The
 *       DOMAIN_SALT prevents cross-contract rainbow tables but not targeted guessing.
 *
 *   (C) No internal email-to-email transfer exists (by design). Moving value
 *       between two emails = the owner withdraws to a wallet, then sends USDC
 *       normally. Keeping the contract from ever holding a "ledger transfer" path
 *       avoids any money-transmission-style internal balance reassignment.
 *
 *   (D) Refunds of UNCLAIMED deposits. If a vault is still unbound after
 *       REFUND_DELAY since a depositor's last deposit to it, that depositor may
 *       reclaim up to the amount THEY deposited. This is a deliberate, narrow
 *       exception to "only the owner moves funds": before binding there IS no
 *       owner, and without it a typo'd email locks funds forever. Once bound,
 *       refunds are permanently disabled for that vault. A depositor can never
 *       reclaim more than their own contribution, and each new deposit by the
 *       same depositor resets their refund timer for that vault.
 *
 *   (E) Risk caps (pre-audit blast-radius limits). Deposits revert if an
 *       UNBOUND vault would exceed UNBOUND_VAULT_CAP, or if the contract's total
 *       tracked balance would exceed MAX_TOTAL_HELD. Both are compile-time
 *       constants — there is no admin who can raise them; raising them requires
 *       deploying a new contract. Bound vaults have no per-vault cap (ownership
 *       is proven), but still count toward the TVL cap.
 *
 *   (F) Withdrawal fee (gas-cost recovery in USDC). Each withdrawal may carry a
 *       `fee` (<= MAX_FEE) that is part of the OWNER-SIGNED struct — the signer
 *       always sees and authorizes the exact fee; a relayer can charge less but
 *       never more. The fee is an internal credit to `feeVaultHash` (set at
 *       deployment); the operator redeems it via the same bind+withdraw path as
 *       everyone else, so no privileged movement is introduced. Fee credits are
 *       exempt from UNBOUND_VAULT_CAP (else accumulated fees would brick all
 *       withdrawals) and do not change totalBalance (USDC stays in-contract).
 * ─────────────────────────────────────────────────────────────────────────────
 */
contract EmailVaultUSDC is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The USDC token this vault holds (set once, immutable).
    IERC20 public immutable usdc;

    /// @notice Backend attestor permitted to authorize bindings only (immutable).
    address public immutable bindSigner;

    /// @notice Vault credited with withdrawal fees (the operator's own emailHash).
    ///         Fees land HERE as an internal balance — the operator claims them
    ///         through the exact same bind+withdraw path as any other vault, so
    ///         this introduces NO privileged fund movement.
    bytes32 public immutable feeVaultHash;

    /// @notice Hard ceiling on the per-withdrawal fee (0.25 USDC). A malicious
    ///         frontend/relayer cannot make a signer authorize more than this.
    uint256 public constant MAX_FEE = 250_000; // 0.25 USDC (6 decimals)

    /// @notice Max balance an UNBOUND vault may hold (500 USDC). Constant — no admin can change it.
    uint256 public constant UNBOUND_VAULT_CAP = 500e6;

    /// @notice Max total tracked USDC across all vaults (10,000 USDC). Constant.
    uint256 public constant MAX_TOTAL_HELD = 10_000e6;

    /// @notice How long a vault must stay unbound before a depositor may reclaim.
    uint256 public constant REFUND_DELAY = 14 days;

    /// @notice Sum of all vault balances (tracked; enforces MAX_TOTAL_HELD).
    uint256 public totalBalance;

    /// @notice emailHash => vault balance in micro-USDC.
    mapping(bytes32 => uint256) public balances;

    /// @dev Per-depositor accounting for the refund path (only meaningful while unbound).
    struct DepositRecord {
        uint192 amount;        // total this depositor has put into this vault, minus refunds
        uint64 lastDepositAt;  // refund timer restarts on each new deposit
    }

    /// @notice emailHash => depositor => their refundable record.
    mapping(bytes32 => mapping(address => DepositRecord)) public depositsOf;

    /// @notice emailHash => bound owner EOA. Zero == unbound. Permanent once set.
    mapping(bytes32 => address) public ownerOf;

    /// @notice owner EOA => next withdrawal nonce (replay protection, per signer).
    mapping(address => uint256) public nonces;

    /// @dev EIP-712 type hashes.
    bytes32 private constant BIND_TYPEHASH =
        keccak256("Bind(bytes32 emailHash,address owner)");
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256(
            "Withdraw(bytes32 emailHash,address to,uint256 amount,uint256 fee,uint256 nonce,uint256 deadline)"
        );

    event Deposited(bytes32 indexed emailHash, address indexed sender, uint256 amount);
    event Refunded(bytes32 indexed emailHash, address indexed depositor, uint256 amount);
    event Bound(bytes32 indexed emailHash, address indexed owner);
    event Withdrawn(
        bytes32 indexed emailHash,
        address indexed owner,
        address indexed to,
        uint256 amount
    );
    event FeeCharged(bytes32 indexed emailHash, uint256 fee);

    error ZeroAddress();
    error ZeroAmount();
    error ZeroEmailHash();
    error InvalidBindSignature();
    error AlreadyBoundToDifferentOwner();
    error NotBound();
    error InsufficientBalance();
    error InvalidWithdrawSignature();
    error Expired();
    error VaultCapExceeded();
    error TvlCapExceeded();
    error FeeTooHigh();
    error AlreadyBound();
    error RefundTooEarly();
    error InsufficientDeposit();

    /**
     * @param _usdc          USDC token. Base Sepolia: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
     *                                    Base Mainnet:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
     * @param _bindSigner    Backend attestor address (authorizes bindings only).
     * @param _feeVaultHash  emailHash credited with withdrawal fees (operator's email).
     */
    constructor(
        address _usdc,
        address _bindSigner,
        bytes32 _feeVaultHash
    ) EIP712("EmailVaultUSDC", "1") {
        if (_usdc == address(0) || _bindSigner == address(0)) revert ZeroAddress();
        if (_feeVaultHash == bytes32(0)) revert ZeroEmailHash();
        usdc = IERC20(_usdc);
        bindSigner = _bindSigner;
        feeVaultHash = _feeVaultHash;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEPOSIT (permissionless — anyone can fund any email)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the vault for `emailHash`.
     * @dev Caller must have approved this contract for `amount` USDC first.
     */
    function deposit(bytes32 emailHash, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (emailHash == bytes32(0)) revert ZeroEmailHash();

        uint256 newVaultBalance = balances[emailHash] + amount;
        if (ownerOf[emailHash] == address(0) && newVaultBalance > UNBOUND_VAULT_CAP) {
            revert VaultCapExceeded();
        }
        uint256 newTotal = totalBalance + amount;
        if (newTotal > MAX_TOTAL_HELD) revert TvlCapExceeded();

        // Effects before interaction (CEI). Re-entrancy guard is belt-and-braces.
        balances[emailHash] = newVaultBalance;
        totalBalance = newTotal;
        DepositRecord storage rec = depositsOf[emailHash][msg.sender];
        rec.amount += uint192(amount); // amount <= MAX_TOTAL_HELD << 2^192, cannot truncate
        rec.lastDepositAt = uint64(block.timestamp);

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(emailHash, msg.sender, amount);
    }

    /**
     * @notice Reclaim your own deposit from a vault that is STILL UNBOUND after
     *         REFUND_DELAY since your last deposit to it. See SECURITY NOTES (D).
     */
    function refund(bytes32 emailHash, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (ownerOf[emailHash] != address(0)) revert AlreadyBound();

        DepositRecord storage rec = depositsOf[emailHash][msg.sender];
        if (rec.amount < amount) revert InsufficientDeposit();
        if (block.timestamp < uint256(rec.lastDepositAt) + REFUND_DELAY) revert RefundTooEarly();

        // While unbound, balances[emailHash] == sum of all depositors' records,
        // so these subtractions cannot underflow.
        rec.amount -= uint192(amount);
        balances[emailHash] -= amount;
        totalBalance -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Refunded(emailHash, msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BIND (backend-attested, one-time, idempotent, front-run safe)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Bind `emailHash` to `owner`, authorized by the bindSigner's
     *         EIP-712 attestation. Idempotent if already bound to the same owner;
     *         reverts only if already bound to a *different* address.
     */
    function bind(bytes32 emailHash, address owner, bytes calldata bindSig) external {
        _bind(emailHash, owner, bindSig);
    }

    function _bind(bytes32 emailHash, address owner, bytes calldata bindSig) internal {
        if (owner == address(0)) revert ZeroAddress();
        if (emailHash == bytes32(0)) revert ZeroEmailHash();

        address current = ownerOf[emailHash];
        if (current == owner) return; // idempotent: a replayed bind is a no-op
        if (current != address(0)) revert AlreadyBoundToDifferentOwner();

        bytes32 structHash = keccak256(abi.encode(BIND_TYPEHASH, emailHash, owner));
        bytes32 digest = _hashTypedDataV4(structHash);
        // ECDSA.recover rejects malleable (high-s) and zero-address signatures.
        if (ECDSA.recover(digest, bindSig) != bindSigner) revert InvalidBindSignature();

        ownerOf[emailHash] = owner;
        emit Bound(emailHash, owner);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WITHDRAW (owner-signed; gas may be sponsored by any submitter)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraw `amount` from `emailHash`'s vault to `to`, authorized by
     *         the bound owner's EIP-712 signature. `msg.sender` is irrelevant.
     * @param to        Destination chosen and signed by the owner (any non-zero
     *                  address — owner may withdraw to themselves or pay someone).
     * @param fee       USDC fee (<= MAX_FEE) the owner agrees to pay for gas
     *                  sponsorship. Deducted from the vault on top of `amount`
     *                  and credited to `feeVaultHash`. Part of the signed struct,
     *                  so a relayer cannot charge more than the owner authorized.
     * @param deadline  Unix timestamp after which the signature is invalid.
     * @param ownerSig  EIP-712 signature over the Withdraw struct, by ownerOf[emailHash].
     */
    function withdraw(
        bytes32 emailHash,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        bytes calldata ownerSig
    ) external nonReentrant {
        _withdraw(emailHash, to, amount, fee, deadline, ownerSig);
    }

    /**
     * @notice Bind then withdraw in one transaction (first claim by a recipient).
     * @dev Both steps run internally — no external self-call.
     */
    function bindAndWithdraw(
        bytes32 emailHash,
        address owner,
        bytes calldata bindSig,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        bytes calldata ownerSig
    ) external nonReentrant {
        _bind(emailHash, owner, bindSig);
        _withdraw(emailHash, to, amount, fee, deadline, ownerSig);
    }

    function _withdraw(
        bytes32 emailHash,
        address to,
        uint256 amount,
        uint256 fee,
        uint256 deadline,
        bytes calldata ownerSig
    ) internal {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (fee > MAX_FEE) revert FeeTooHigh();
        if (block.timestamp > deadline) revert Expired();

        address owner = ownerOf[emailHash];
        if (owner == address(0)) revert NotBound();
        if (balances[emailHash] < amount + fee) revert InsufficientBalance();

        uint256 nonce = nonces[owner];
        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_TYPEHASH, emailHash, to, amount, fee, nonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, ownerSig) != owner) revert InvalidWithdrawSignature();

        // Effects (consume nonce + debit) before the token interaction (CEI).
        unchecked {
            nonces[owner] = nonce + 1;
        }
        balances[emailHash] -= amount + fee;
        totalBalance -= amount; // fee stays inside the contract (credited below)

        if (fee > 0) {
            // Internal credit to the operator's vault. Deliberately NOT subject to
            // UNBOUND_VAULT_CAP (it would brick withdrawals once fees accumulate);
            // TVL is unchanged because the USDC never leaves the contract.
            balances[feeVaultHash] += fee;
            emit FeeCharged(emailHash, fee);
        }

        usdc.safeTransfer(to, amount);

        emit Withdrawn(emailHash, owner, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice EIP-712 domain separator for off-chain signers (frontend/backend).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Actual USDC held; for invariant checks. Should equal sum(balances).
    function totalUsdcHeld() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
