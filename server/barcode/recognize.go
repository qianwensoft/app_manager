package barcode

import (
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/oned"
	"github.com/makiuchi-d/gozxing/qrcode"
)

// RecognizeFromFile 从图片文件识别二维码/条形码，返回所有识别到的内容
func RecognizeFromFile(filePath string) ([]string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		return nil, err
	}

	bmp, err := gozxing.NewBinaryBitmapFromImage(img)
	if err != nil {
		return nil, err
	}

	var codes []string
	var readers []gozxing.Reader

	// 添加 QR Code reader
	readers = append(readers, qrcode.NewQRCodeReader())

	// 添加常见的一维码 readers
	readers = append(readers,
		oned.NewCode128Reader(),
		oned.NewEAN13Reader(),
		oned.NewEAN8Reader(),
		oned.NewCode39Reader(),
		oned.NewUPCAReader(),
	)

	// 尝试所有 readers
	seen := make(map[string]bool)
	for _, reader := range readers {
		if result, err := reader.Decode(bmp, nil); err == nil && result != nil {
			text := result.GetText()
			if text != "" && !seen[text] {
				codes = append(codes, text)
				seen[text] = true
			}
		}
	}

	return codes, nil
}
