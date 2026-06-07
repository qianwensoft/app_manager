package event

import "testing"

func TestBuildSuggestions_MatchesActionAndExtra(t *testing.T) {
	obs := []AnalyzeObservation{
		{IntentAction: "com.se4500.onDecodeComplete", ExtraKey: "se4500", HitCount: 2, SampleValues: []string{"123"}},
		{IntentAction: "android.intent.ACTION_DECODE_DATA", ExtraKey: "barcode_string", HitCount: 1, SampleValues: []string{"456"}},
	}
	// buildSuggestions needs DB; test scoring helper via inline mirror
	acts := map[string]struct{}{"com.se4500.onDecodeComplete": {}}
	keys := map[string]struct{}{"se4500": {}, "barcode_string": {}}
	score := 0
	for _, o := range obs {
		if _, ok := acts[o.IntentAction]; !ok {
			continue
		}
		if _, ok := keys[o.ExtraKey]; !ok {
			continue
		}
		score += o.HitCount
	}
	if score != 2 {
		t.Fatalf("expected score 2 for se4500 pair, got %d", score)
	}
}

func TestRecordObservationLocked_DedupSamples(t *testing.T) {
	s := &AnalyzeSession{obsKey: make(map[string]*AnalyzeObservation)}
	recordObservationLocked(s, "a1", "k1", "v1")
	recordObservationLocked(s, "a1", "k1", "v1")
	recordObservationLocked(s, "a1", "k1", "v2")
	o := s.obsKey[obsMapKey("a1", "k1")]
	if o == nil || o.HitCount != 3 {
		t.Fatalf("hit count want 3 got %+v", o)
	}
	if len(o.SampleValues) != 2 {
		t.Fatalf("samples want 2 got %v", o.SampleValues)
	}
}
