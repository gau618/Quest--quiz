-- src/lib/redis/matchmaking.lua
-- KEYS[1]: The queue name
-- ARGV[1]: The new player's user ID
-- ARGV[2]: The new player's ELO score
-- ARGV[3]: The minimum ELO to search for
-- ARGV[4]: The maximum ELO to search for
-- ARGV[5]: The JSON data for the new player

-- Search for a suitable opponent in the specified ELO range.
local opponents = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[3], ARGV[4], 'LIMIT', 0, 1)

-- Check if an opponent was found.
if #opponents > 0 then
    local opponent_string = opponents[1]
    local opponent_id = string.match(opponent_string, "([^:]+)")

    -- Ensure the found opponent is not the current player.
    if opponent_id ~= ARGV[1] then
        -- Atomically remove the opponent from the queue.
        local removed = redis.call('ZREM', KEYS[1], opponent_string)
        if removed > 0 then
            -- If successfully removed, return their data to signal a match.
            return opponent_string
        end
    end
end

-- If no suitable opponent was found, clean up stale entries for the current player.
local stale_entries = redis.call('ZRANGEBYLEX', KEYS[1], '[' .. ARGV[1] .. ':', '[' .. ARGV[1] .. ':\255')
if #stale_entries > 0 then
    redis.call('ZREM', KEYS[1], unpack(stale_entries))
end

-- Add the new player to the queue.
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1] .. ':' .. ARGV[5])

-- Return nil to indicate no match was found.
return nil
