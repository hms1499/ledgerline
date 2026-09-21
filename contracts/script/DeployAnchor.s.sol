// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

contract DeployAnchor is Script {
    function run() external returns (PayoutAnchor anchor) {
        vm.startBroadcast();
        anchor = new PayoutAnchor();
        vm.stopBroadcast();
    }
}
