package com.appmanager.agent.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.BarcodeFormat
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.multi.GenericMultipleBarcodeReader
import java.io.File

/**
 * 从静态照片中解码二维码（问题反馈拍照后自动识别其他编码）。
 *
 * 用 zxing core（随 zxing-android-embedded 传递引入，已在 classpath）：
 * 照片 → Bitmap →（按需缩放防 OOM）→ RGBLuminanceSource → BinaryBitmap →
 * GenericMultipleBarcodeReader 解多码；失败回退单码解码。纯本地，无新权限/依赖。
 */
object QrPhotoDecoder {

    private const val MAX_EDGE = 1600 // 最长边上限，超出按比例缩小，兼顾识别率与内存

    /** 解码照片中的全部二维码，去重后返回；无码或失败返回空表。 */
    fun decodeAll(file: File): List<String> {
        if (!file.exists() || file.length() == 0L) return emptyList()
        val bitmap = decodeScaledBitmap(file) ?: return emptyList()
        try {
            val w = bitmap.width
            val h = bitmap.height
            val pixels = IntArray(w * h)
            bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
            val source = RGBLuminanceSource(w, h, pixels)
            val binary = BinaryBitmap(HybridBinarizer(source))
            val hints = mapOf(
                DecodeHintType.TRY_HARDER to true,
                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
            )
            // 先尝试多码
            try {
                val reader = GenericMultipleBarcodeReader(MultiFormatReader().apply { setHints(hints) })
                val results = reader.decodeMultiple(binary, hints)
                val codes = results.mapNotNull { it.text?.trim()?.takeIf(String::isNotEmpty) }
                if (codes.isNotEmpty()) return codes.distinct()
            } catch (_: Throwable) { /* 落到单码 */ }
            // 回退单码
            try {
                val one = MultiFormatReader().apply { setHints(hints) }.decode(binary, hints)
                one.text?.trim()?.takeIf(String::isNotEmpty)?.let { return listOf(it) }
            } catch (_: Throwable) { /* 无码 */ }
            return emptyList()
        } finally {
            bitmap.recycle()
        }
    }

    /** 按 MAX_EDGE 采样加载 bitmap，避免大图 OOM。 */
    private fun decodeScaledBitmap(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        val longEdge = maxOf(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (longEdge / sample > MAX_EDGE) sample *= 2
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return runCatching { BitmapFactory.decodeFile(file.absolutePath, opts) }.getOrNull()
    }
}
