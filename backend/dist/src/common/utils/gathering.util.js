"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateGatheringReward = calculateGatheringReward;
const gathering_config_1 = require("../config/gathering.config");
function calculateGatheringReward({ elapsedSeconds, tier, progressRemainder, rateMultiplier = 1, }) {
    const elapsedHours = Math.min(elapsedSeconds / 3600, gathering_config_1.MAX_GATHERING_HOURS_PER_RESOLVE);
    const ratePerHour = gathering_config_1.GATHERING_RATE_BY_TIER[tier] ?? 1;
    const rawAmount = elapsedHours * ratePerHour * rateMultiplier + progressRemainder;
    const quantity = Math.floor(rawAmount);
    const newProgressRemainder = rawAmount - quantity;
    return {
        quantity,
        newProgressRemainder,
        elapsedHours,
        ratePerHour,
        rawAmount,
    };
}
//# sourceMappingURL=gathering.util.js.map