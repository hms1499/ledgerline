// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @notice The other common batching shape: the payer sends tokens to the
 *         batcher, and the batcher pays out from its own balance. Disperse.app
 *         works this way.
 *
 * @dev Test-only, and deliberately outside src/. It takes custody of funds and
 *      must never be deployed as part of the product.
 */
contract CustodialBatcher {
    function disperse(address token, address[] calldata to, uint256[] calldata amounts) external {
        for (uint256 i = 0; i < to.length; i++) {
            IERC20(token).transfer(to[i], amounts[i]);
        }
    }
}
