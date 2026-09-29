-- ACTIVE includes both the running craft and future entries in its queue.
-- CraftingService serializes enqueue operations with a character row lock and
-- schedules each entry after the previous completesAt, without overlapping work.
DROP INDEX IF EXISTS "crafting_sessions_one_active_per_character_idx";
