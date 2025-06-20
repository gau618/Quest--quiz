-- src/lib/redis/matchmaking.lua
-- KEYS[1]: The queue name (e.g., 'matchmaking_queue_FASTEST_FINGER_FIRST_2min')
-- ARGV[1]: The new player's user ID
-- ARGV[2]: The new player's ELO score
-- ARGV[3]: The minimum ELO to search for
-- ARGV[4]: The maximum ELO to search for
-- ARGV[5]: The JSON data for the new player (including timestamp and timePerQuestion)

-- Step 1: Search for a suitable opponent in the specified ELO range.
-- ZRANGEBYSCORE returns members that are within the score (ELO) range.
-- The member string is "userId:playerDataJson". We need to check if opponent_id != ARGV[1] (new player's userId)
local opponents = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[3], ARGV[4], 'LIMIT', 0, 1)

-- Step 2: Check if a suitable opponent was found and if it's not the current player.
if #opponents > 0 then
    local opponent_string = opponents[1]
    local opponent_id = string.match(opponent_string, "([^:]+)") -- Extract userId before the first colon

    -- Ensure the found opponent is not the current player itself (race condition where one might find themselves)
    if opponent_id ~= ARGV[1] then
        -- Step 3a: Atomically remove the opponent from the queue.
        local removed = redis.call('ZREM', KEYS[1], opponent_string)
        if removed > 0 then
            -- If successfully removed, return the opponent's string to the Node.js side.
            -- This signals that a match was found and completed.
            return opponent_string
        end
    end
end

-- Step 3b: If no suitable opponent was found (or if the found opponent was already taken, or was self),
-- clean up any stale entries for the current player and add them to the queue.

-- Clean up stale entries for the new player to prevent duplicates.
-- This is crucial because the member string includes a timestamp, making each entry unique.
-- We want only one entry per userId in the queue at any given time.
local stale_entries = redis.call('ZRANGEBYLEX', KEYS[1], '[' .. ARGV[1] .. ':', '[' .. ARGV[1] .. ':\255')
if #stale_entries > 0 then
    -- ZREM can take multiple members, so unpack the table of stale entries.
    redis.call('ZREM', KEYS[1], unpack(stale_entries))
end

-- Add the new player to the queue.
-- The score is their ELO (ARGV[2]), and the member is "userId:playerDataJson".
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1] .. ':' .. ARGV[5])

-- Return nil to indicate no match was found, and the player was added to the queue.
return nil
