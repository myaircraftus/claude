#!/usr/bin/env python3
import json
import sys

def fail(message: str, code: int = 1):
    sys.stderr.write(message + "\n")
    sys.exit(code)

def main():
    if len(sys.argv) < 2:
        fail("Usage: local_ocr.py /path/to.pdf")

    pdf_path = sys.argv[1]

    try:
        from pdf2image import convert_from_path
        import pytesseract
        from pytesseract import Output
    except Exception as exc:
        fail(f"Missing OCR dependencies. Install pdf2image + pytesseract. {exc}")

    try:
        images = convert_from_path(pdf_path, dpi=220)
    except Exception as exc:
        fail(f"Failed to render PDF pages: {exc}")

    pages = []
    for idx, image in enumerate(images, start=1):
        try:
            data = pytesseract.image_to_data(image, output_type=Output.DICT)
            text = " ".join([t for t in data.get("text", []) if t and t.strip()])
            confidences = []
            for conf in data.get("conf", []):
                try:
                    conf_value = float(conf)
                    if conf_value >= 0:
                        confidences.append(conf_value / 100.0)
                except Exception:
                    continue
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.55
        except Exception as exc:
            fail(f"OCR failed on page {idx}: {exc}")

        pages.append({
            "page_number": idx,
            "text": text,
            "ocr_confidence": avg_conf,
        })

    sys.stdout.write(json.dumps({"pages": pages}))


if __name__ == "__main__":
    main()
