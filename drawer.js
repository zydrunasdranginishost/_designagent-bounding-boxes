// Element type to color mapping
const TYPE_COLORS = {
	text: '#ff4444',
	button: '#44ff44',
	svg: '#4444ff',
	image: '#ffaa00',
	social_icons: '#ff44ff',
	map: '#44ffff',
	video: '#ff8844',
	gallery: '#88ff44',
	contact_form: '#8844ff',
	section: '#ffffff',
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Pasted image data URL (set by clipboard paste or drag-and-drop)
let pastedImageDataUrl = null;

function showError(message) {
	const errorDiv = document.getElementById('error');

	errorDiv.textContent = message;
	errorDiv.classList.remove('hidden');
}

function hideError() {
	document.getElementById('error').classList.add('hidden');
}

function clearCanvas() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	canvas.width = 0;
	canvas.height = 0;
	document.getElementById('legend').innerHTML = '';
	hideError();

	// Also clear pasted image if present
	clearPastedImage();
}

async function copyCanvasToClipboard() {
	hideError();

	if (canvas.width === 0 || canvas.height === 0) {
		showError('No image to copy. Draw bounding boxes first.');

		return;
	}

	try {
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

		await navigator.clipboard.write([
			new ClipboardItem({ 'image/png': blob }),
		]);

		// Show brief success feedback
		const buttons = document.querySelectorAll('.button-group button');
		const copyBtn = buttons[1];
		const originalText = copyBtn.textContent;

		copyBtn.textContent = 'Copied!';
		copyBtn.style.background = '#44ff44';
		copyBtn.style.color = '#000';

		setTimeout(() => {
			copyBtn.textContent = originalText;
			copyBtn.style.background = '';
			copyBtn.style.color = '';
		}, 1500);
	} catch (error) {
		showError(`Failed to copy: ${error.message}`);
	}
}

function normalizeBase64(base64String) {
	base64String = JSON.parse(base64String).image.trim();

	// If it already has a data URL prefix, return as is
	if (base64String.startsWith('data:image')) {
		return base64String;
	}

	// Try to detect image type from the base64 content
	// PNG starts with iVBOR
	// JPEG starts with /9j/
	// GIF starts with R0lG
	// WebP starts with UklG

	let mimeType = 'image/png'; // default

	if (base64String.startsWith('/9j/')) {
		mimeType = 'image/jpeg';
	} else if (base64String.startsWith('R0lG')) {
		mimeType = 'image/gif';
	} else if (base64String.startsWith('UklG')) {
		mimeType = 'image/webp';
	}

	return `data:${mimeType};base64,${base64String}`;
}

function draw() {
	hideError();

	const base64Input = document.getElementById('base64Input').value.trim();
	const jsonInput = document.getElementById('jsonInput').value.trim();

	// Determine image source: pasted image takes priority, then base64 textarea
	let imageSrc = null;

	if (pastedImageDataUrl) {
		imageSrc = pastedImageDataUrl;
	} else if (base64Input) {
		try {
			imageSrc = normalizeBase64(base64Input);
		} catch (error) {
			showError(`Invalid base64 image: ${error.message}`);
			return;
		}
	} else {
		showError('Please provide an image (paste from clipboard or enter Base64 JSON)');
		return;
	}

	if (!jsonInput) {
		showError('Please provide ImageDesignLayout JSON');

		return;
	}

	let layout;

	try {
		layout = JSON.parse(jsonInput);
	} catch (error) {
		showError(`Invalid JSON: ${error.message}`);

		return;
	}

	const showLabels = document.getElementById('showLabels').checked;
	const showSections = document.getElementById('showSections').checked;
	const colorByType = document.getElementById('colorByType').checked;

	const img = new Image();

	img.addEventListener('load', () => {
		drawWithImage(img, layout, {
			showLabels,
			showSections,
			colorByType,
		});
	});

	img.onerror = () => {
		showError('Failed to load image. Make sure the image data is valid.');
	};

	img.src = imageSrc;
}

function drawWithImage(img, layout, options) {
	const {
		showLabels,
		showSections,
		colorByType,
	} = options;

	// Calculate total height from sections
	const totalHeight = layout.sections.reduce((sum, section) => sum + section.height, 0);

	// Set canvas size to match image
	canvas.width = img.width;
	canvas.height = img.height;

	// Calculate scale factor
	const scaleX = img.width / layout.page_width;
	const scaleY = img.height / totalHeight;

	// Draw the image
	ctx.drawImage(img, 0, 0);

	// Track used element types for legend
	const usedTypes = new Set();

	// Track section Y offset
	let sectionYOffset = 0;

	// Draw section boundaries and bounding boxes
	layout.sections.forEach((section, sectionIndex) => {
		const sectionTop = sectionYOffset * scaleY;
		const sectionHeight = section.height * scaleY;

		// Draw section boundary
		if (showSections) {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2;
			ctx.setLineDash([
				10,
				5,
			]);
			ctx.strokeRect(0, sectionTop, canvas.width, sectionHeight);
			ctx.setLineDash([]);

			// Draw section name
			ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
			ctx.font = 'bold 14px sans-serif';
			ctx.fillText(`Section: ${section.name}`, 10, sectionTop + 20);
		}

		// Draw bounding boxes
		if (section.bounding_boxes && Array.isArray(section.bounding_boxes)) {
			// Sort by z-index for proper layering
			const sortedBoxes = [...section.bounding_boxes].sort((a, b) => a.z_index - b.z_index);

			sortedBoxes.forEach((boundingBox) => {
				const {
					box_2d,
					element,
				} = boundingBox;

				if (!box_2d || !element) return;

				const elementType = element.type;

				usedTypes.add(elementType);

				// Calculate scaled positions (relative to section)
				const x = box_2d.left * scaleX;
				const y = sectionTop + (box_2d.top * scaleY);
				const width = box_2d.width * scaleX;
				const height = box_2d.height * scaleY;

				// Choose color
				const color = colorByType ? (TYPE_COLORS[elementType] || '#ff4444') : '#ff4444';

				// Draw bounding box
				ctx.strokeStyle = color;
				ctx.lineWidth = 2;
				ctx.strokeRect(x, y, width, height);

				// Draw semi-transparent fill
				ctx.fillStyle = hexToRgba(color, 0.1);
				ctx.fillRect(x, y, width, height);

				// Draw label
				if (showLabels) {
					const label = elementType;

					ctx.font = 'bold 11px sans-serif';
					const textMetrics = ctx.measureText(label);
					const textWidth = textMetrics.width + 6;
					const textHeight = 16;

					// Background for label
					ctx.fillStyle = color;
					ctx.fillRect(x, y - textHeight, textWidth, textHeight);

					// Label text
					ctx.fillStyle = '#ffffff';
					ctx.fillText(label, x + 3, y - 4);
				}
			});
		}

		sectionYOffset += section.height;
	});

	// Update legend
	updateLegend(usedTypes, colorByType);
}

function hexToRgba(hex, alpha) {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);

	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateLegend(usedTypes, colorByType) {
	const legendDiv = document.getElementById('legend');

	if (!colorByType || usedTypes.size === 0) {
		legendDiv.innerHTML = '';

		return;
	}

	let html = '';

	usedTypes.forEach((type) => {
		const color = TYPE_COLORS[type] || '#ff4444';

		html += `
            <div class="legend-item">
                <div class="legend-color" style="background: ${hexToRgba(color, 0.3)}; border-color: ${color};"></div>
                <span>${type}</span>
            </div>
        `;
	});

	legendDiv.innerHTML = html;
}

// --- Clipboard paste & drag-and-drop image support ---

const pasteZone = document.getElementById('pasteZone');

function setPastedImage(dataUrl, name) {
	pastedImageDataUrl = dataUrl;

	// Update paste zone to show preview
	pasteZone.classList.add('has-image');
	pasteZone.innerHTML = `
		<button class="clear-image" title="Remove image" onclick="clearPastedImage(event)">&times;</button>
		<img class="image-preview" src="${dataUrl}" alt="Pasted image">
		<div class="image-name">${name || 'Pasted image'}</div>
	`;

	// Clear the base64 textarea since we're using the pasted image
	document.getElementById('base64Input').value = '';
}

function clearPastedImage(event) {
	if (event) {
		event.stopPropagation();
	}

	pastedImageDataUrl = null;
	pasteZone.classList.remove('has-image');
	pasteZone.innerHTML = `
		<div class="paste-icon">&#128203;</div>
		<div class="paste-text"><strong>Paste image here</strong> (Ctrl/Cmd+V)</div>
		<div class="paste-hint">or drag &amp; drop an image file</div>
		<button class="paste-btn" onclick="event.stopPropagation(); pasteFromClipboardAPI()">Paste from Clipboard</button>
	`;
}

function handleImageFile(file) {
	if (!file || !file.type.startsWith('image/')) {
		showError('The pasted content is not an image.');
		return;
	}

	hideError();

	const reader = new FileReader();

	reader.addEventListener('load', () => {
		setPastedImage(reader.result, file.name || 'Clipboard image');
	});

	reader.onerror = () => {
		showError('Failed to read the pasted image.');
	};

	reader.readAsDataURL(file);
}

// Handle paste events on the whole document
document.addEventListener('paste', (e) => {
	const clipboardData = e.clipboardData;

	if (!clipboardData) return;

	// Check for image files in clipboard items
	const items = clipboardData.items;

	if (items) {
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith('image/')) {
				e.preventDefault();
				const file = items[i].getAsFile();
				handleImageFile(file);
				return;
			}
		}
	}

	// Fallback: check clipboardData.files (some browsers/OS put images here)
	const files = clipboardData.files;

	if (files && files.length > 0) {
		for (let i = 0; i < files.length; i++) {
			if (files[i].type.startsWith('image/')) {
				e.preventDefault();
				handleImageFile(files[i]);
				return;
			}
		}
	}
});

// Also support reading from clipboard via the async Clipboard API (for "Copy Image" on macOS)
async function pasteFromClipboardAPI() {
	hideError();

	try {
		const clipboardItems = await navigator.clipboard.read();

		for (const item of clipboardItems) {
			for (const type of item.types) {
				if (type.startsWith('image/')) {
					const blob = await item.getType(type);
					const reader = new FileReader();

					reader.addEventListener('load', () => {
						setPastedImage(reader.result, 'Clipboard image');
					});

					reader.onerror = () => {
						showError('Failed to read the clipboard image.');
					};

					reader.readAsDataURL(blob);
					return;
				}
			}
		}

		showError('No image found in clipboard. Copy an image first, then try again.');
	} catch (error) {
		showError(`Cannot read clipboard: ${error.message}. Try pressing Ctrl/Cmd+V instead.`);
	}
}

// Handle drag-and-drop on the paste zone
pasteZone.addEventListener('dragover', (e) => {
	e.preventDefault();
	pasteZone.classList.add('drag-over');
});

pasteZone.addEventListener('dragleave', (e) => {
	e.preventDefault();
	pasteZone.classList.remove('drag-over');
});

pasteZone.addEventListener('drop', (e) => {
	e.preventDefault();
	pasteZone.classList.remove('drag-over');

	const files = e.dataTransfer.files;

	if (files.length > 0) {
		handleImageFile(files[0]);
	}
});

// Click on paste zone to open file picker
pasteZone.addEventListener('click', () => {
	if (pastedImageDataUrl) return; // Don't open picker if image already loaded

	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/*';

	input.addEventListener('change', () => {
		if (input.files.length > 0) {
			handleImageFile(input.files[0]);
		}
	});

	input.click();
});

// Add keyboard shortcut
document.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
		draw();
	}
});

console.log('ImageDesignLayout Bounding Box Visualizer loaded. Press Cmd/Ctrl + Enter to draw.');
