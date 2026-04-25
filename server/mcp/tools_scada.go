package mcp

import (
	"encoding/json"
	"fmt"

	"app-manager/database"
	"app-manager/models"
)

// ── list_scada ────────────────────────────────────────────────────────────────

type listScadaParams struct {
	GroupID *uint `json:"group_id"`
}

func listScada(raw json.RawMessage) (any, *RPCError) {
	var p listScadaParams
	if err := json.Unmarshal(raw, &p); err != nil && string(raw) != "null" && string(raw) != "{}" {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	var rows []models.ScadaInfo
	q := database.DB.Select("id,group_id,scada_name,scada_code,description,publish_status,content_version,updated_at")
	if p.GroupID != nil {
		q = q.Where("group_id = ?", *p.GroupID)
	}
	q.Order("id DESC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── get_canvas ────────────────────────────────────────────────────────────────

type getCanvasParams struct {
	ScadaID uint `json:"scada_id"`
}

func getCanvas(raw json.RawMessage) (any, *RPCError) {
	var p getCanvasParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	var row models.ScadaInfo
	if err := database.DB.First(&row, p.ScadaID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "scada not found"}
	}
	var canvasData any
	if row.CanvasData != "" {
		if err := json.Unmarshal([]byte(row.CanvasData), &canvasData); err != nil {
			canvasData = row.CanvasData
		}
	}
	return map[string]any{
		"id":          row.ID,
		"scada_name":  row.ScadaName,
		"scada_code":  row.ScadaCode,
		"canvas_data": canvasData,
	}, nil
}

// ── save_canvas ───────────────────────────────────────────────────────────────

type saveCanvasParams struct {
	ScadaID    uint            `json:"scada_id"`
	CanvasData json.RawMessage `json:"canvas_data"`
}

func saveCanvas(raw json.RawMessage) (any, *RPCError) {
	var p saveCanvasParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	var row models.ScadaInfo
	if err := database.DB.First(&row, p.ScadaID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "scada not found"}
	}
	if err := database.DB.Model(&row).Updates(map[string]any{
		"canvas_data":     string(p.CanvasData),
		"content_version": row.ContentVersion + 1,
	}).Error; err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	return map[string]any{"ok": true, "content_version": row.ContentVersion + 1}, nil
}

// ── publish_scada ─────────────────────────────────────────────────────────────

type publishScadaParams struct {
	ScadaID uint `json:"scada_id"`
}

func publishScada(raw json.RawMessage) (any, *RPCError) {
	var p publishScadaParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if err := database.DB.Model(&models.ScadaInfo{}).Where("id = ?", p.ScadaID).
		Updates(map[string]any{"publish_status": 1}).Error; err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	return map[string]any{"ok": true}, nil
}

// ── add_element ───────────────────────────────────────────────────────────────

type addElementParams struct {
	ScadaID  uint            `json:"scada_id"`
	CanvasID int             `json:"canvas_id"`
	Element  json.RawMessage `json:"element"`
}

func addElement(raw json.RawMessage) (any, *RPCError) {
	var p addElementParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	return patchCanvasElements(p.ScadaID, p.CanvasID, func(elements []any) ([]any, error) {
		var el any
		if err := json.Unmarshal(p.Element, &el); err != nil {
			return nil, err
		}
		return append(elements, el), nil
	})
}

// ── update_element ────────────────────────────────────────────────────────────

type updateElementParams struct {
	ScadaID   uint            `json:"scada_id"`
	CanvasID  int             `json:"canvas_id"`
	ElementID string          `json:"element_id"`
	Patch     json.RawMessage `json:"patch"`
}

func updateElement(raw json.RawMessage) (any, *RPCError) {
	var p updateElementParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	var patch map[string]any
	if err := json.Unmarshal(p.Patch, &patch); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "invalid patch: " + err.Error()}
	}
	return patchCanvasElements(p.ScadaID, p.CanvasID, func(elements []any) ([]any, error) {
		for i, raw := range elements {
			el, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			if fmt.Sprint(el["id"]) == p.ElementID {
				for k, v := range patch {
					el[k] = v
				}
				elements[i] = el
				return elements, nil
			}
		}
		return nil, fmt.Errorf("element %s not found", p.ElementID)
	})
}

// ── delete_element ────────────────────────────────────────────────────────────

type deleteElementParams struct {
	ScadaID   uint   `json:"scada_id"`
	CanvasID  int    `json:"canvas_id"`
	ElementID string `json:"element_id"`
}

func deleteElement(raw json.RawMessage) (any, *RPCError) {
	var p deleteElementParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	return patchCanvasElements(p.ScadaID, p.CanvasID, func(elements []any) ([]any, error) {
		out := elements[:0]
		for _, raw := range elements {
			el, ok := raw.(map[string]any)
			if ok && fmt.Sprint(el["id"]) == p.ElementID {
				continue
			}
			out = append(out, raw)
		}
		return out, nil
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func patchCanvasElements(scadaID uint, canvasID int, fn func([]any) ([]any, error)) (any, *RPCError) {
	var row models.ScadaInfo
	if err := database.DB.First(&row, scadaID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "scada not found"}
	}

	var project map[string]any
	if err := json.Unmarshal([]byte(row.CanvasData), &project); err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: "invalid canvas_data: " + err.Error()}
	}

	canvases, _ := project["canvases"].(map[string]any)
	key := fmt.Sprint(canvasID)
	canvas, _ := canvases[key].(map[string]any)
	if canvas == nil {
		return nil, &RPCError{Code: ErrNotFound, Message: fmt.Sprintf("canvas %d not found", canvasID)}
	}

	elements, _ := canvas["elements"].([]any)
	updated, err := fn(elements)
	if err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	canvas["elements"] = updated
	canvases[key] = canvas
	project["canvases"] = canvases

	newData, err := json.Marshal(project)
	if err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	if err := database.DB.Model(&row).Updates(map[string]any{
		"canvas_data":     string(newData),
		"content_version": row.ContentVersion + 1,
	}).Error; err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	return map[string]any{"ok": true}, nil
}
