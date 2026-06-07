package custompreset

// PDAScanPreset 常用手持终端 / 扫码枪 Intent 输出模板（厂商差异大，可按现场再改）。
type PDAScanPreset struct {
	Key         string
	Name        string
	Description string
	Actions     []string
	ExtraKeys   []string
}

// PDAScanPresets 一键导入列表；同 key 已存在时可跳过。
func PDAScanPresets() []PDAScanPreset {
	return []PDAScanPreset{
		{
			Key:         "pda_generic_scan_service",
			Name:        "通用 Android 扫码服务",
			Description: "部分国产/工业机系统扫码服务广播",
			Actions: []string{
				"com.android.server.scannerservice.broadcast",
				"android.intent.ACTION_DECODE_DATA",
			},
			ExtraKeys: []string{"scannerdata", "data", "barcode_string", "decode_data", "SCAN_DATA", "barcode", "BARCODE"},
		},
		{
			Key:         "pda_newland_nlscan",
			Name:        "新大陆 NLScan",
			Description: "新大陆常见输出",
			Actions:     []string{"nlscan.action.SCANNER_RESULT"},
			ExtraKeys:   []string{"SCAN_BARCODE1", "SCAN_DATA", "barcode", "data"},
		},
		{
			Key:         "pda_se4500_decode",
			Name:        "新大陆 SE4500（com.dawn.java）",
			Description: "SC40 等机型扫码服务 com.se4500.onDecodeComplete，数据标签常为 se4500",
			Actions:     []string{"com.se4500.onDecodeComplete"},
			ExtraKeys:   []string{"se4500", "barcode_string", "data", "barcode", "scannerdata", "SCAN_DATA"},
		},
		{
			Key:         "pda_honeywell_decode",
			Name:        "Honeywell 霍尼韦尔",
			Description: "Decode 库 Intent 输出",
			Actions: []string{
				"com.honeywell.decode.intent.action.BARCODE_DATA",
				"com.honeywell.decode.intent.action.EDIT_DATA",
			},
			ExtraKeys: []string{"data", "barcode_string", "decode_data", "barcode", "BARCODE"},
		},
		{
			Key:         "pda_zebra_datawedge",
			Name:        "Zebra / Symbol DataWedge",
			Description: "需在 DataWedge 中配置「Intent 输出」到下列 action 之一，并按实际 extra 名调整数据标签",
			Actions: []string{
				"com.symbol.datawedge.api.RESULT_ACTION",
				"com.zebra.dw.intent.action.ACTION_DECODE_DATA",
				"com.zebra.dw.action.ACTION_DECODE_DATA",
				"com.motorolasolutions.emdk.datawedge.api.ACTION_DATA",
			},
			ExtraKeys: []string{"com.symbol.datawedge.data_string", "data", "decode_data", "barcode_string", "SCAN_DATA"},
		},
		{
			Key:         "pda_sunmi_scanner",
			Name:        "商米 Sunmi",
			Description: "商米扫码组件常见广播",
			Actions: []string{
				"com.sunmi.scanner.ACTION_DATA",
				"com.sunmi.scanner.ACTION_DATA_CODE_RECEIVED",
			},
			ExtraKeys: []string{"data", "barcode", "barcodeData"},
		},
		{
			Key:         "pda_unitech",
			Name:        "Unitech 精联",
			Description: "",
			Actions:     []string{"unitech.scanservice.data"},
			ExtraKeys:   []string{"data", "barcode", "decode_data"},
		},
		{
			Key:         "pda_datalogic",
			Name:        "Datalogic 得利捷",
			Description: "部分机型软扫/硬扫",
			Actions: []string{
				"com.datalogic.decode.intent.action.BARCODE_DATA",
				"com.datalogic.decode.action.BARCODE_SCANNED",
			},
			ExtraKeys: []string{"barcode_string", "data", "com.datalogic.decode.data"},
		},
		{
			Key:         "pda_chainway",
			Name:        "成为 Chainway",
			Description: "常见成为手持机",
			Actions: []string{
				"com.rscja.scanner.action.scanner.RAW",
				"com.android.server.scannerservice.broadcast",
			},
			ExtraKeys: []string{"scannerdata", "data", "barcode", "decode_data"},
		},
		{
			Key:         "pda_seuic",
			Name:        "东大集成 SEUIC",
			Description: "",
			Actions:     []string{"com.scan.onDecode", "com.android.server.scannerservice.broadcast"},
			ExtraKeys:   []string{"barcode", "data", "scannerdata", "decode_data"},
		},
		{
			Key:         "pda_idata",
			Name:        "iData 盈达",
			Description: "",
			Actions:     []string{"com.android.scancontext", "android.intent.ACTION_DECODE_DATA"},
			ExtraKeys:   []string{"barcode_string", "data", "barcode"},
		},
		{
			Key:         "pda_keyence",
			Name:        "Keyence 基恩士 BT",
			Description: "部分型号通过 Intent 输出，以现场配置为准",
			Actions:     []string{"com.keyence.autoid.scanner_action"},
			ExtraKeys:   []string{"data", "barcode_data", "BARCODE"},
		},
		{
			Key:         "pda_urovo",
			Name:        "优博讯 Urovo",
			Description: "",
			Actions: []string{
				"android.intent.ACTION_DECODE_DATA",
				"com.android.server.scannerservice.broadcast",
			},
			ExtraKeys: []string{"barcode_string", "data", "scannerdata"},
		},
	}
}
