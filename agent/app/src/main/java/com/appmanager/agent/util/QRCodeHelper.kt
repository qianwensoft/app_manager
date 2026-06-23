package com.appmanager.agent.util

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

/**
 * QR 码生成工具
 */
object QRCodeHelper {

    /**
     * 生成二维码 Bitmap
     * @param content 二维码内容
     * @param size 二维码尺寸（宽高相同）
     * @return Bitmap 对象
     */
    fun generateQRCode(content: String, size: Int = 512): Bitmap {
        if (content.isEmpty()) {
            throw IllegalArgumentException("QR code content cannot be empty")
        }

        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size)
        val width = bitMatrix.width
        val height = bitMatrix.height
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)

        for (x in 0 until width) {
            for (y in 0 until height) {
                bitmap.setPixel(x, y, if (bitMatrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }

        return bitmap
    }
}
