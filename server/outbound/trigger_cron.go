package outbound

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

func runCronTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	expr := strings.TrimSpace(cfg.CronExpression)
	if expr == "" {
		log.Printf("trigger[cron] session %q: empty cron_expression", sess.key)
		return
	}

	loc := time.Local
	if tz := strings.TrimSpace(cfg.CronTimezone); tz != "" {
		if l, err := time.LoadLocation(tz); err == nil {
			loc = l
		} else {
			log.Printf("trigger[cron] session %q: invalid timezone %q, using local: %v", sess.key, tz, err)
		}
	}

	eventType := strings.TrimSpace(cfg.CronEventType)
	if eventType == "" {
		eventType = "cron.tick"
	}
	typeField := strings.TrimSpace(cfg.TypeField)
	if typeField == "" {
		typeField = "event_type"
	}

	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	if _, err := parser.Parse(expr); err != nil {
		log.Printf("trigger[cron] session %q: invalid expression %q: %v", sess.key, expr, err)
		return
	}

	c := cron.New(cron.WithLocation(loc), cron.WithParser(parser))
	_, err := c.AddFunc(expr, func() {
		payload, err := json.Marshal(map[string]interface{}{
			typeField:  eventType,
			"session":  sess.key,
			"fired_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
		if err != nil {
			return
		}
		DispatchTriggerMessage(db, sess, payload)
	})
	if err != nil {
		log.Printf("trigger[cron] session %q: schedule failed: %v", sess.key, err)
		return
	}

	log.Printf("trigger[cron] session %q started expr=%q tz=%s", sess.key, expr, loc.String())
	c.Start()
	defer c.Stop()
	<-ctx.Done()
}
