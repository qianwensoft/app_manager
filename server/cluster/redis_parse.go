package cluster

import (
	"strings"

	"github.com/redis/go-redis/v9"
)

func parseRedisURL(raw string) (*redis.Client, error) {
	opt, err := redis.ParseURL(strings.TrimSpace(raw))
	if err != nil {
		return nil, err
	}
	return redis.NewClient(opt), nil
}
