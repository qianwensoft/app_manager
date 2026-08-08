package schemasync

import "app-manager/models"

// Entry maps a Go model's JSON wire fields to a schema/api TypeScript interface.
type Entry struct {
	Name        string
	Model       any
	TSRelPath   string // under repo schema/, e.g. api/data-stack.ts
	TSInterface string
	// Fields documented only on one side (intentional drift).
	AllowGoOnly []string
	AllowTSOnly []string
}

// Registry is the canonical reconcile list. Add an entry when a model is exposed over REST.
var Registry = []Entry{
	{Name: "DataSource", Model: models.DataSource{}, TSRelPath: "api/data-stack.ts", TSInterface: "DataSource"},
	{Name: "Dataset", Model: models.Dataset{}, TSRelPath: "api/data-stack.ts", TSInterface: "Dataset",
		AllowGoOnly: []string{"data_source"}, AllowTSOnly: []string{"data_source"}},
	{Name: "DataStructure", Model: models.DataStructure{}, TSRelPath: "api/data-stack.ts", TSInterface: "DataStructure",
		AllowGoOnly: []string{"dataset"}, AllowTSOnly: []string{"dataset"}},
	{Name: "DataInterfaceGroup", Model: models.DataInterfaceGroup{}, TSRelPath: "api/data-stack.ts", TSInterface: "DataInterfaceGroup"},
	{Name: "DataInterface", Model: models.DataInterface{}, TSRelPath: "api/data-stack.ts", TSInterface: "DataInterface",
		AllowGoOnly: []string{"dataset", "data_structure"}, AllowTSOnly: []string{"dataset", "data_structure"}},

	{Name: "FormAppInfo", Model: models.FormAppInfo{}, TSRelPath: "api/form-app.ts", TSInterface: "FormAppInfo"},
	{Name: "FormAppPage", Model: models.FormAppPage{}, TSRelPath: "api/form-app.ts", TSInterface: "FormAppPage"},
	{Name: "FormAppPageLink", Model: models.FormAppPageLink{}, TSRelPath: "api/form-app.ts", TSInterface: "FormAppPageLink"},
	{Name: "FormAppEventRoute", Model: models.FormAppEventRoute{}, TSRelPath: "api/form-app.ts", TSInterface: "FormAppEventRoute"},
	{Name: "FormAppAccessPolicy", Model: models.FormAppAccessPolicy{}, TSRelPath: "api/form-app.ts", TSInterface: "FormAppAccessPolicy"},
	{Name: "FormAppDraft", Model: models.FormAppDraft{}, TSRelPath: "api/form-app.ts", TSInterface: "FormAppDraft",
		AllowGoOnly: []string{"user_id"}, AllowTSOnly: []string{"user_id"}},

	{Name: "ScadaGroup", Model: models.ScadaGroup{}, TSRelPath: "api/scada.ts", TSInterface: "ScadaGroup"},
	{Name: "ScadaInfo", Model: models.ScadaInfo{}, TSRelPath: "api/scada.ts", TSInterface: "ScadaInfo"},

	{Name: "AgentMenuItem", Model: models.AgentMenuItem{}, TSRelPath: "api/agent-menu.ts", TSInterface: "AgentMenuItem"},
	{Name: "AgentMenuManifestItem", Model: models.AgentMenuItem{}, TSRelPath: "form-app/agent.ts", TSInterface: "FormAppMenuBundleItem",
		AllowGoOnly: []string{"created_at", "updated_at", "sort_order"},
		AllowTSOnly: []string{"preview_path", "content_version"}},

	{Name: "Device", Model: models.Device{}, TSRelPath: "api/device.ts", TSInterface: "Device"},

	{Name: "DocumentNode", Model: models.DocumentNode{}, TSRelPath: "api/document.ts", TSInterface: "DocumentNode"},
	{Name: "DocumentVersion", Model: models.DocumentVersion{}, TSRelPath: "api/document.ts", TSInterface: "DocumentVersion"},
	{Name: "DocumentRole", Model: models.DocumentRole{}, TSRelPath: "api/document.ts", TSInterface: "DocumentRole"},
}

// FieldDiff compares Go JSON fields with TS interface fields.
type FieldDiff struct {
	MissingInTS []string
	MissingInGo []string
}

func CompareFields(goFields, tsFields []string, allowGoOnly, allowTSOnly []string) FieldDiff {
	goSet := toSet(goFields)
	tsSet := toSet(tsFields)
	for _, k := range allowGoOnly {
		delete(goSet, k)
	}
	for _, k := range allowTSOnly {
		delete(tsSet, k)
	}
	var missingInTS, missingInGo []string
	for k := range goSet {
		if _, ok := tsSet[k]; !ok {
			missingInTS = append(missingInTS, k)
		}
	}
	for k := range tsSet {
		if _, ok := goSet[k]; !ok {
			missingInGo = append(missingInGo, k)
		}
	}
	return FieldDiff{MissingInTS: missingInTS, MissingInGo: missingInGo}
}

func toSet(fields []string) map[string]struct{} {
	m := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		m[f] = struct{}{}
	}
	return m
}
