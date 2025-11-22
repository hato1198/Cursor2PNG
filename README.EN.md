# Cursor2PNG

[日本語版はこちら](README.md)

A tool to convert Windows mouse cursor files (`.cur`, `.ani`) into PNG format compatible with the Mac application "Mousecape".

Currently under development. This repository includes both a Python-based desktop application and a web-based version.

## Directory Structure

- **python/**: Source code for the Python version (GUI App & CLI Tool).
- **web/**: Source code for the Web version (HTML/CSS/JS).

---

## How to Use the Python Version

A GUI application using Tkinter that supports drag-and-drop batch conversion.

### Requirements

- Python 3.x

### Installation

After cloning the repository, navigate to the `python` directory and install the required dependencies.

```bash
cd python
pip install -r requirements.txt
```

### Usage

#### GUI Application (Main Tool)
Launch the app to drag and drop files, generating PNG images and metadata for Mousecape.

```bash
# Run inside the python directory
python main_app.py
```

**Features:**
- Preview `.cur` / `.ani` files.
- Batch conversion of multiple files.
- Exports hotspot coordinates and frame size data.
- Resize capability.

#### CLI Tool (For Analysis)
A script to analyze the internal structure of ANI files (frame rates, sequence info) in the console.

```bash
python check_ani.py "path/to/your_cursor.ani"
```

---

## How to Use the Web Version

Open `index.html` located in the `web` directory in your browser.
(Or host it using GitHub Pages).

---

## License

[MIT License](LICENSE)