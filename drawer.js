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

	if (!base64Input) {
		showError('Please provide a base64 image');

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
		showError('Failed to load image. Make sure the base64 string is valid.');
	};

	img.src = normalizeBase64(base64Input);
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

// Add keyboard shortcut
document.addEventListener('keydown', (e) => {
	if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
		draw();
	}
});

console.log('ImageDesignLayout Bounding Box Visualizer loaded. Press Cmd/Ctrl + Enter to draw.');
