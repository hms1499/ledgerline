// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

/// @dev Reads vectors produced by the TypeScript Merkle implementation and
///      verifies them on chain. If these two ever disagree, real payouts would
///      anchor roots whose proofs nobody can verify.
contract MerkleCrossCheckTest is Test {
    PayoutAnchor anchor;
    address payer = address(0xA11CE);

    string json;

    function setUp() public {
        anchor = new PayoutAnchor();
        json = vm.readFile("../packages/core/test/fixtures/merkle-vectors.json");
    }

    function test_typescriptProofsVerifyOnChain() public {
        bytes32 root = vm.parseJsonBytes32(json, ".root");
        bytes32[] memory memoIds = vm.parseJsonBytes32Array(json, ".memoIds");
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        address[] memory recipients = vm.parseJsonAddressArray(json, ".recipients");
        string[] memory amounts = vm.parseJsonStringArray(json, ".amounts");

        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, uint32(memoIds.length));
        bytes32 runId = anchor.runIdFor(payer, keccak256("RUN"));

        for (uint256 i = 0; i < memoIds.length; i++) {
            bytes32[] memory proof = vm.parseJsonBytes32Array(
                json, string.concat(".proofs[", vm.toString(i), "]")
            );
            assertTrue(
                anchor.verifyItem(
                    runId, memoIds[i], tokens[i], recipients[i], vm.parseUint(amounts[i]), proof
                ),
                "TypeScript proof failed on chain"
            );
        }
    }

    function test_leafDerivationMatchesTypeScript() public view {
        bytes32[] memory leaves = vm.parseJsonBytes32Array(json, ".leaves");
        bytes32[] memory memoIds = vm.parseJsonBytes32Array(json, ".memoIds");
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        address[] memory recipients = vm.parseJsonAddressArray(json, ".recipients");
        string[] memory amounts = vm.parseJsonStringArray(json, ".amounts");

        for (uint256 i = 0; i < leaves.length; i++) {
            assertEq(
                keccak256(abi.encode(memoIds[i], tokens[i], recipients[i], vm.parseUint(amounts[i]))),
                leaves[i],
                "leafFor() and the contract disagree on leaf encoding"
            );
        }
    }

    function test_tamperedAmountIsRejected() public {
        bytes32 root = vm.parseJsonBytes32(json, ".root");
        bytes32[] memory memoIds = vm.parseJsonBytes32Array(json, ".memoIds");
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        address[] memory recipients = vm.parseJsonAddressArray(json, ".recipients");
        string[] memory amounts = vm.parseJsonStringArray(json, ".amounts");

        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, 3);
        bytes32 runId = anchor.runIdFor(payer, keccak256("RUN"));

        bytes32[] memory proof = vm.parseJsonBytes32Array(json, ".proofs[0]");
        assertFalse(
            anchor.verifyItem(
                runId, memoIds[0], tokens[0], recipients[0], vm.parseUint(amounts[0]) + 1, proof
            ),
            "one extra unit must break the proof"
        );
    }
}
