package com.appmanager.agent.printer

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * 把结构化打印指令（来自 form-app 的 PrintOp 列表）生成为打印机协议字节流。
 *
 * 输入 payload（与 form-app/src/runtime/printerTypes.ts 约定一致）：
 * ```
 * {
 *   "protocol": "cpcl" | "escpos" | "tspl",
 *   "gen_side": "agent" | "frontend",
 *   "content": [
 *     {"op":"text","text":"商品名","align":"left|center|right","size":1,"bold":false},
 *     {"op":"barcode","format":"code128|code39|ean13|ean8","data":"6901234","height":80},
 *     {"op":"qrcode","data":"https://...","size":6},
 *     {"op":"line"}, {"op":"feed","lines":2}, {"op":"cut"}
 *   ],
 *   "raw_base64": "..."   // gen_side=frontend：前端已生成的协议字节，直接透传
 * }
 * ```
 */
object ProtocolBuilder {

    /** 由 payload 生成最终字节；优先 raw_base64 透传，否则按 protocol 生成。 */
    fun build(payload: JSONObject): ByteArray {
        // 原始指令透传（前端生成 / 高级用户手写）
        val rawB64 = payload.optString("raw_base64", "")
        if (rawB64.isNotEmpty()) {
            return Base64.decode(rawB64, Base64.DEFAULT)
        }
        val rawHex = payload.optString("raw_hex", "")
        if (rawHex.isNotEmpty()) {
            return hexToBytes(rawHex)
        }

        val protocol = payload.optString("protocol", "escpos").lowercase()
        val content = payload.optJSONArray("content") ?: JSONArray()
        val paper = payload.optJSONObject("paper")
        val layoutMode = payload.optString("layout_mode", "flow")
        val dpi = resolveDpi(paper)

        // canvas（坐标布局）：仅 tspl/cpcl 支持绝对定位；其余回退顺序流
        if (layoutMode == "canvas") {
            val elements = payload.optJSONArray("elements") ?: JSONArray()
            // print_when 条件判定所需的原始字段值；缺省时视为无条件（不过滤）。
            val values = payload.optJSONObject("values")
            return when (protocol) {
                "cpcl" -> buildCpclCanvas(elements, paper, dpi, values)
                "tspl" -> buildTsplCanvas(elements, paper, dpi, values)
                else -> buildEscPos(content)
            }
        }

        return when (protocol) {
            "cpcl" -> buildCpcl(content, paper, dpi)
            "tspl" -> buildTspl(content, paper)
            else -> buildEscPos(content)
        }
    }

    // 打印机分辨率（dpi）：取 paper.dpi，缺省/非法回退 203。常见 203/300/600。
    private fun resolveDpi(paper: JSONObject?): Int {
        val d = paper?.optInt("dpi", 0) ?: 0
        return if (d in 100..1200) d else 203
    }

    // mm → dots：按指定 dpi 换算（dots = mm / 25.4 * dpi）。dpi 缺省时调用方传 203。
    private fun mmToDots(mm: Double, dpi: Int): Int = Math.round(mm / 25.4 * dpi).toInt()

    // 原点偏移（mm）：补偿打印机物理起点误差，仅作用于元素位置坐标，不影响尺寸。
    private fun offsetXmm(paper: JSONObject?): Double = paper?.optDouble("offset_x_mm", 0.0) ?: 0.0
    private fun offsetYmm(paper: JSONObject?): Double = paper?.optDouble("offset_y_mm", 0.0) ?: 0.0

    // ── 元素打印条件（print_when）─────────────────────────────────────
    // 与 form-app/src/runtime/printBridge.ts evalPrintCondition 行为对齐。
    // 条件 = {field, op, value}；取 values[field] 与 value 按 op 比较，成立才打印该元素。
    // 无条件 / 未设 field / 缺少 values → 始终打印（不过滤）。
    // 前端通常已过滤一遍，这里作为服务端中转/原始下发路径的兜底再判定。
    private fun shouldPrint(el: JSONObject, values: JSONObject?): Boolean {
        val cond = el.optJSONObject("print_when") ?: return true
        val field = cond.optString("field", "")
        if (field.isEmpty()) return true
        val op = cond.optString("op", "not_empty")
        val str = lookupValue(values, field)
        val cmp = cond.optString("value", "")
        val num = str.toDoubleOrNull()
        val cmpNum = cmp.toDoubleOrNull()
        val bothNumeric = str.isNotEmpty() && cmp.isNotEmpty() && num != null && cmpNum != null
        return when (op) {
            "eq" -> str == cmp
            "ne" -> str != cmp
            "gt" -> if (bothNumeric) num!! > cmpNum!! else str > cmp
            "gte" -> if (bothNumeric) num!! >= cmpNum!! else str >= cmp
            "lt" -> if (bothNumeric) num!! < cmpNum!! else str < cmp
            "lte" -> if (bothNumeric) num!! <= cmpNum!! else str <= cmp
            "len_eq" -> str.length == (cmpNum?.toInt() ?: -1)
            "len_gt" -> str.length > (cmpNum?.toInt() ?: Int.MAX_VALUE)
            "len_lt" -> str.length < (cmpNum?.toInt() ?: Int.MIN_VALUE)
            "empty" -> str.isEmpty()
            "not_empty" -> str.isNotEmpty()
            "contains" -> cmp.isNotEmpty() && str.contains(cmp)
            else -> true
        }
    }

    // 取 values 中 field 对应值（支持 a.b 路径）；缺失/为 null 返回空串。
    private fun lookupValue(values: JSONObject?, field: String): String {
        if (values == null) return ""
        var cur: Any? = values
        for (key in field.split(".")) {
            cur = (cur as? JSONObject)?.opt(key) ?: return ""
            if (cur == JSONObject.NULL) return ""
        }
        return if (cur == null || cur == JSONObject.NULL) "" else cur.toString()
    }

    // ── ESC/POS（小票机） ──────────────────────────────────────────
    private fun buildEscPos(content: JSONArray): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0x1B, 0x40)) // ESC @ 初始化
        for (i in 0 until content.length()) {
            val op = content.optJSONObject(i) ?: continue
            when (op.optString("op")) {
                "text" -> {
                    val align = op.optString("align", "left")
                    out.write(byteArrayOf(0x1B, 0x61, alignCode(align))) // ESC a n
                    val size = op.optInt("size", 1).coerceIn(1, 3)
                    // GS ! n：宽高放大（0=正常，0x11=2x，0x22=3x）
                    val magnify = when (size) { 2 -> 0x11; 3 -> 0x22; else -> 0x00 }
                    out.write(byteArrayOf(0x1D, 0x21, magnify.toByte()))
                    val bold = op.optBoolean("bold", false)
                    out.write(byteArrayOf(0x1B, 0x45, if (bold) 1 else 0)) // ESC E n 粗体
                    out.write(op.optString("text", "").toByteArray(Charsets.UTF_8))
                    out.write(0x0A) // LF
                    // 复位
                    out.write(byteArrayOf(0x1D, 0x21, 0x00))
                    out.write(byteArrayOf(0x1B, 0x45, 0x00))
                }
                "barcode" -> {
                    out.write(byteArrayOf(0x1B, 0x61, 0x01)) // 居中
                    out.write(byteArrayOf(0x1D, 0x68, op.optInt("height", 80).toByte())) // GS h 高度
                    out.write(byteArrayOf(0x1D, 0x77, 0x02)) // GS w 宽度
                    out.write(byteArrayOf(0x1D, 0x48, 0x02)) // HRI 在下方
                    val data = op.optString("data", "")
                    val type = escposBarcodeType(op.optString("format", "code128"))
                    // GS k m n d1...dn（function B，含长度字节）
                    out.write(byteArrayOf(0x1D, 0x6B, type, data.length.toByte()))
                    out.write(data.toByteArray(Charsets.US_ASCII))
                    out.write(0x0A)
                }
                "qrcode" -> {
                    val data = op.optString("data", "").toByteArray(Charsets.UTF_8)
                    val size = op.optInt("size", 6).coerceIn(1, 16)
                    out.write(byteArrayOf(0x1B, 0x61, 0x01)) // 居中
                    // 选择模型2
                    out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))
                    // 模块大小
                    out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size.toByte()))
                    // 纠错等级 M
                    out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31))
                    // 存数据
                    val len = data.size + 3
                    out.write(byteArrayOf(0x1D, 0x28, 0x6B, (len and 0xFF).toByte(), ((len shr 8) and 0xFF).toByte(), 0x31, 0x50, 0x30))
                    out.write(data)
                    // 打印
                    out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30))
                    out.write(0x0A)
                }
                "line" -> {
                    out.write(byteArrayOf(0x1B, 0x61, 0x00))
                    out.write("--------------------------------".toByteArray())
                    out.write(0x0A)
                }
                "feed" -> {
                    val lines = op.optInt("lines", 1).coerceIn(0, 20)
                    repeat(lines) { out.write(0x0A) }
                }
                "cut" -> {
                    out.write(byteArrayOf(0x0A, 0x0A, 0x0A))
                    out.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00)) // GS V 切纸
                }
                "image" -> { /* 位图打印较复杂，最小集暂不实现 */ }
            }
        }
        return out.toByteArray()
    }

    private fun alignCode(a: String): Byte = when (a) {
        "center" -> 0x01
        "right" -> 0x02
        else -> 0x00
    }

    private fun escposBarcodeType(fmt: String): Byte = when (fmt) {
        "code39" -> 0x04
        "ean13" -> 0x02
        "ean8" -> 0x03
        else -> 0x49 // CODE128（function B）
    }

    // ── CPCL（便携/标签机，如 Zebra/部分热敏） ─────────────────────
    // paper.type=label 且给定 height_mm 时，按实际 dpi 换算标签高度，覆盖自动估算。
    private fun buildCpcl(content: JSONArray, paper: JSONObject?, dpi: Int): ByteArray {
        val sb = StringBuilder()
        // 估算高度：每个可见元素给固定行高，最终再补余量
        val lineH = 40
        var y = 10
        val body = StringBuilder()
        for (i in 0 until content.length()) {
            val op = content.optJSONObject(i) ?: continue
            when (op.optString("op")) {
                "text" -> {
                    val size = op.optInt("size", 1).coerceIn(1, 3)
                    val font = when (size) { 2 -> 4; 3 -> 5; else -> 0 }
                    val text = op.optString("text", "")
                    val align = op.optString("align", "left")
                    when (align) {
                        "center" -> { body.append("CENTER\r\n"); body.append("TEXT $font 0 0 $y $text\r\n"); body.append("LEFT\r\n") }
                        "right" -> { body.append("RIGHT\r\n"); body.append("TEXT $font 0 0 $y $text\r\n"); body.append("LEFT\r\n") }
                        else -> body.append("TEXT $font 0 30 $y $text\r\n")
                    }
                    y += lineH + size * 10
                }
                "barcode" -> {
                    val data = op.optString("data", "")
                    val h = op.optInt("height", 80)
                    val type = cpclBarcodeType(op.optString("format", "code128"))
                    body.append("BARCODE $type 1 1 $h 30 $y $data\r\n")
                    y += h + 30
                }
                "qrcode" -> {
                    val data = op.optString("data", "")
                    val size = op.optInt("size", 6).coerceIn(1, 32)
                    body.append("BARCODE QR 30 $y M 2 U $size\r\n")
                    body.append("MA,$data\r\n")
                    body.append("ENDQR\r\n")
                    y += size * 25 + 30
                }
                "line" -> {
                    body.append("LINE 30 $y 560 $y 1\r\n")
                    y += 20
                }
                "feed" -> { y += (op.optInt("lines", 1).coerceIn(0, 20)) * lineH }
                "cut" -> { /* CPCL 便携机通常无切刀，忽略 */ }
            }
        }
        val autoHeight = y + 40
        // 标签纸：用配置高度（mm→dots，按实际 dpi）覆盖自动估算，保证标签定位
        val height = if (paper?.optString("type") == "label" && paper.optDouble("height_mm", 0.0) > 0) {
            mmToDots(paper.optDouble("height_mm"), dpi)
        } else autoHeight
        sb.append("! 0 $dpi $dpi $height 1\r\n")
        sb.append(body)
        sb.append("FORM\r\n")
        sb.append("PRINT\r\n")
        // CPCL 打印机通常需要 GB2312/GBK 编码才能正确打印中文
        return sb.toString().toByteArray(charset("GBK"))
    }

    private fun cpclBarcodeType(fmt: String): String = when (fmt) {
        "code39" -> "39"
        "ean13" -> "EAN13"
        "ean8" -> "EAN8"
        else -> "128"
    }

    // ── TSPL（标签机，如 TSC） ─────────────────────────────────────
    // paper.type=label 时用配置的宽高(mm)生成 SIZE/GAP；否则沿用默认 60x40。
    // 字体：GBK 编码须用 CHNGB.BF2（简体中文 GB2312/GBK），不可用 TSS24.BF2（繁体 Big5）。
    // paper.tspl_font 可覆盖默认字体，用于适配不同机型（如 ROMAN.TTF / TSS24.BF2）。
    private fun tsplFont(paper: JSONObject?): String {
        val f = paper?.optString("tspl_font", "")
        return if (!f.isNullOrBlank()) f else "CHNGB.BF2"
    }

    private fun buildTspl(content: JSONArray, paper: JSONObject?): ByteArray {
        val sb = StringBuilder()
        if (paper?.optString("type") == "label"
            && paper.optDouble("width_mm", 0.0) > 0
            && paper.optDouble("height_mm", 0.0) > 0
        ) {
            val w = trimNum(paper.optDouble("width_mm"))
            val h = trimNum(paper.optDouble("height_mm"))
            val gap = trimNum(if (paper.has("gap_mm")) paper.optDouble("gap_mm") else 2.0)
            sb.append("SIZE $w mm, $h mm\r\n")
            sb.append("GAP $gap mm, 0 mm\r\n")
        } else {
            sb.append("SIZE 60 mm, 40 mm\r\n")
            sb.append("GAP 2 mm, 0 mm\r\n")
        }
        sb.append("DIRECTION 1\r\n")
        sb.append("CLS\r\n")
        var y = 10
        for (i in 0 until content.length()) {
            val op = content.optJSONObject(i) ?: continue
            when (op.optString("op")) {
                "text" -> {
                    val size = op.optInt("size", 1).coerceIn(1, 3)
                    val text = op.optString("text", "").replace("\"", "")
                    val font = tsplFont(paper)
                    sb.append("TEXT 20,$y,\"$font\",0,$size,$size,\"$text\"\r\n")
                    y += 30 + size * 10
                }
                "barcode" -> {
                    val data = op.optString("data", "").replace("\"", "")
                    val h = op.optInt("height", 80)
                    sb.append("BARCODE 20,$y,\"128\",$h,1,0,2,2,\"$data\"\r\n")
                    y += h + 20
                }
                "qrcode" -> {
                    val data = op.optString("data", "").replace("\"", "")
                    val size = op.optInt("size", 6).coerceIn(1, 10)
                    sb.append("QRCODE 20,$y,M,$size,A,0,\"$data\"\r\n")
                    y += size * 25 + 20
                }
                "line" -> { sb.append("BAR 20,$y,560,2\r\n"); y += 12 }
                "feed" -> { y += op.optInt("lines", 1).coerceIn(0, 20) * 30 }
                "cut" -> { /* 由 PRINT 后处理 */ }
            }
        }
        sb.append("PRINT 1,1\r\n")
        // TSPL 打印机通常需要 GB2312/GBK 编码才能正确打印中文
        return sb.toString().toByteArray(charset("GBK"))
    }

    // ── TSPL 坐标布局 ──────────────────────────────────────────────
    // 元素坐标/尺寸单位 mm，按实际 dpi 换算为 dots。
    // 字体由 tsplFont(paper) 决定：paper.tspl_font 可覆盖，缺省 CHNGB.BF2（简体中文固件机）。
    // 若打印机无该字体文件，TEXT 命令会被静默跳过——文字不出来时先换内置编号字体（"0"~"8"）排查。
    private fun buildTsplCanvas(elements: JSONArray, paper: JSONObject?, dpi: Int, values: JSONObject?): ByteArray {
        val sb = StringBuilder()
        if (paper?.optString("type") == "label"
            && paper.optDouble("width_mm", 0.0) > 0
            && paper.optDouble("height_mm", 0.0) > 0
        ) {
            val w = trimNum(paper.optDouble("width_mm"))
            val h = trimNum(paper.optDouble("height_mm"))
            val gap = trimNum(if (paper.has("gap_mm")) paper.optDouble("gap_mm") else 2.0)
            sb.append("SIZE $w mm, $h mm\r\n")
            sb.append("GAP $gap mm, 0 mm\r\n")
        } else {
            sb.append("SIZE 60 mm, 40 mm\r\n")
            sb.append("GAP 2 mm, 0 mm\r\n")
        }
        sb.append("DIRECTION 1\r\n")
        sb.append("CLS\r\n")
        val offX = offsetXmm(paper)
        val offY = offsetYmm(paper)
        for (i in 0 until elements.length()) {
            val el = elements.optJSONObject(i) ?: continue
            if (!shouldPrint(el, values)) continue
            val x = mmToDots(el.optDouble("x_mm", 0.0) + offX, dpi).coerceAtLeast(0)
            val y = mmToDots(el.optDouble("y_mm", 0.0) + offY, dpi).coerceAtLeast(0)
            val rotate = el.optInt("rotate", 0)
            when (el.optString("type")) {
                "text" -> {
                    val mag = el.optInt("font_size", 1).coerceIn(1, 10)
                    val text = el.optString("text", "").replace("\"", "")
                    val font = tsplFont(paper)
                    sb.append("TEXT $x,$y,\"$font\",$rotate,$mag,$mag,\"$text\"\r\n")
                }
                "barcode" -> {
                    val data = el.optString("data", "").replace("\"", "")
                    val h = mmToDots(el.optDouble("height_mm", 10.0), dpi)
                    val type = tsplBarcodeType(el.optString("format", "code128"))
                    sb.append("BARCODE $x,$y,\"$type\",$h,1,$rotate,2,2,\"$data\"\r\n")
                }
                "qrcode" -> {
                    val data = el.optString("data", "").replace("\"", "")
                    val cell = el.optInt("cell", 4).coerceIn(1, 10)
                    sb.append("QRCODE $x,$y,M,$cell,A,$rotate,\"$data\"\r\n")
                }
                "line" -> {
                    val w = mmToDots(el.optDouble("width_mm", 20.0), dpi)
                    val th = mmToDots(el.optDouble("thickness_mm", 0.5), dpi).coerceAtLeast(1)
                    sb.append("BAR $x,$y,$w,$th\r\n")
                }
                "rect" -> {
                    val w = mmToDots(el.optDouble("width_mm", 20.0), dpi)
                    val h = mmToDots(el.optDouble("height_mm", 10.0), dpi)
                    val th = mmToDots(el.optDouble("thickness_mm", 0.5), dpi).coerceAtLeast(1)
                    sb.append("BOX $x,$y,${x + w},${y + h},$th\r\n")
                }
            }
        }
        sb.append("PRINT 1,1\r\n")
        // TSPL 打印机通常需要 GB2312/GBK 编码才能正确打印中文
        return sb.toString().toByteArray(charset("GBK"))
    }

    private fun tsplBarcodeType(fmt: String): String = when (fmt) {
        "code39" -> "39"
        "ean13" -> "EAN13"
        "ean8" -> "EAN8"
        else -> "128"
    }

    // ── CPCL 坐标布局 ──────────────────────────────────────────────
    private fun buildCpclCanvas(elements: JSONArray, paper: JSONObject?, dpi: Int, values: JSONObject?): ByteArray {
        val sb = StringBuilder()
        val height = if (paper?.optString("type") == "label" && paper.optDouble("height_mm", 0.0) > 0) {
            mmToDots(paper.optDouble("height_mm"), dpi)
        } else 480
        sb.append("! 0 $dpi $dpi $height 1\r\n")
        val offX = offsetXmm(paper)
        val offY = offsetYmm(paper)
        for (i in 0 until elements.length()) {
            val el = elements.optJSONObject(i) ?: continue
            if (!shouldPrint(el, values)) continue
            val x = mmToDots(el.optDouble("x_mm", 0.0) + offX, dpi).coerceAtLeast(0)
            val y = mmToDots(el.optDouble("y_mm", 0.0) + offY, dpi).coerceAtLeast(0)
            when (el.optString("type")) {
                "text" -> {
                    // 用 SETMAG 放大基础字体，支持 1~10 倍（超出 CPCL 固定字号表）
                    val mag = el.optInt("font_size", 1).coerceIn(1, 10)
                    val text = el.optString("text", "")
                    if (mag > 1) {
                        sb.append("SETMAG $mag $mag\r\n")
                        sb.append("TEXT 0 0 $x $y $text\r\n")
                        sb.append("SETMAG 0 0\r\n") // 复位，避免影响后续元素
                    } else {
                        sb.append("TEXT 0 0 $x $y $text\r\n")
                    }
                }
                "barcode" -> {
                    val data = el.optString("data", "")
                    val h = mmToDots(el.optDouble("height_mm", 10.0), dpi)
                    val type = cpclBarcodeType(el.optString("format", "code128"))
                    sb.append("BARCODE $type 1 1 $h $x $y $data\r\n")
                }
                "qrcode" -> {
                    val data = el.optString("data", "")
                    val cell = el.optInt("cell", 4).coerceIn(1, 32)
                    sb.append("BARCODE QR $x $y M 2 U $cell\r\n")
                    sb.append("MA,$data\r\n")
                    sb.append("ENDQR\r\n")
                }
                "line" -> {
                    val w = mmToDots(el.optDouble("width_mm", 20.0), dpi)
                    val th = mmToDots(el.optDouble("thickness_mm", 0.5), dpi).coerceAtLeast(1)
                    sb.append("LINE $x $y ${x + w} $y $th\r\n")
                }
                "rect" -> {
                    val w = mmToDots(el.optDouble("width_mm", 20.0), dpi)
                    val h = mmToDots(el.optDouble("height_mm", 10.0), dpi)
                    val th = mmToDots(el.optDouble("thickness_mm", 0.5), dpi).coerceAtLeast(1)
                    sb.append("BOX $x $y ${x + w} ${y + h} $th\r\n")
                }
            }
        }
        sb.append("FORM\r\n")
        sb.append("PRINT\r\n")
        // CPCL 打印机通常需要 GB2312/GBK 编码才能正确打印中文
        return sb.toString().toByteArray(charset("GBK"))
    }

    // 数值格式化：整数去掉 .0（40.0→"40"），否则保留（49.5→"49.5"）
    private fun trimNum(d: Double): String =
        if (d == Math.floor(d) && !d.isInfinite()) d.toLong().toString() else d.toString()

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.replace(Regex("[^0-9a-fA-F]"), "")
        val out = ByteArray(clean.length / 2)
        for (i in out.indices) {
            out[i] = ((Character.digit(clean[i * 2], 16) shl 4) + Character.digit(clean[i * 2 + 1], 16)).toByte()
        }
        return out
    }
}
