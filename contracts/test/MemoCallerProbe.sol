// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @notice Probe for spec §6.1: does Arc's Memo precompile reject a
 *         smart-contract caller?
 *
 * @dev The result is emitted rather than returned, because eth_call and
 *      debug_traceCall both force msg.sender == tx.origin and therefore
 *      cannot test the anti-spoofing rule at all. Only a real transaction
 *      proves it, and a real transaction's return value is only observable
 *      through a log.
 */
contract MemoCallerProbe {
    event MemoAttempt(bool ok, bytes ret);

    function tryMemo(address memo, bytes calldata data) external returns (bool ok) {
        bytes memory ret;
        (ok, ret) = memo.call(data);
        emit MemoAttempt(ok, ret);
    }

    receive() external payable {}
}
