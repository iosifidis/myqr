import './style.css';
import {
  createIcons,
  QrCode,
  Scan,
  Plus,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Copy,
  Check,
  Settings,
  Download,
  X,
  Camera,
  Image,
  Flashlight,
  Database,
  RefreshCw,
  Smartphone,
  Search,
  ScanLine,
  ArrowUpDown,
  PlusCircle,
  BookmarkPlus,
  Upload,
  Globe,
  Wifi,
  Mail,
  Phone,
  FileText
} from 'lucide';

import {
  fetchAllQRs,
  addQR,
  updateQR,
  deleteQR,
  saveOrder,
  detectType,
  getConfig,
  saveConfig,
  testConnection,
  getSupabaseSql,
  syncLocalToCloud,
  isCloudConfigured
} from './db.js';

import {
  startScanner,
  stopScanner,
  toggleTorch,
  scanImageFile
} from './scanner.js';

import {
  renderQRCode,
  downloadCanvasAsImage
} from './qrRenderer.js';

// Application State
let qrItems = [];
let activeFilteredItems = [];
let currentDetailsItem = null;
let itemPendingDelete = null;
let deferredInstallPrompt = null;
let draggedItemId = null;

// Initialize Lucide icons helper
function refreshIcons() {
  createIcons({
    icons: {
      QrCode,
      Scan,
      Plus,
      Trash2,
      Edit3,
      ArrowUp,
      ArrowDown,
      ExternalLink,
      Copy,
      Check,
      Settings,
      Download,
      X,
      Camera,
      Image,
      Flashlight,
      Database,
      RefreshCw,
      Smartphone,
      Search,
      ScanLine,
      ArrowUpDown,
      PlusCircle,
      BookmarkPlus,
      Upload,
      Globe,
      Wifi,
      Mail,
      Phone,
      FileText
    }
  });
}

// Toast Notifications System
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconName = type === 'success' ? 'check' : type === 'error' ? 'trash-2' : 'qr-code';

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// HTML escape helper for security
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format relative/localized date
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
}

// Badge color & title according to type
function getTypeBadgeHtml(type) {
  const map = {
    url: { label: 'URL', class: 'type-url' },
    wifi: { label: 'WiFi', class: 'type-wifi' },
    email: { label: 'Email', class: '' },
    phone: { label: 'Τηλ.', class: '' },
    text: { label: 'Κείμενο', class: '' }
  };
  const info = map[type] || map.text;
  return `<span class="badge-type ${info.class}">${info.label}</span>`;
}

// Update Sync Badge in Header
function updateSyncBadge() {
  const badge = document.getElementById('syncStatusBadge');
  if (!badge) return;
  const isCloud = isCloudConfigured();
  if (isCloud) {
    badge.className = 'badge-status badge-cloud';
    badge.querySelector('.status-label').textContent = 'Cloud Supabase';
    badge.title = 'Συνδεδεμένο με Cloud Βάση Supabase';
  } else {
    badge.className = 'badge-status badge-local';
    badge.querySelector('.status-label').textContent = 'Τοπική μνήμη';
    badge.title = 'Αποθηκεύεται τοπικά στη συσκευή. Πατήστε Ρυθμίσεις για Cloud';
  }
}

// Render QR Code List
function renderList() {
  const container = document.getElementById('qrListContainer');
  const emptyState = document.getElementById('emptyState');
  const noResultsState = document.getElementById('noResultsState');
  const countBadge = document.getElementById('itemsCountBadge');
  const searchInput = document.getElementById('searchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  if (!container) return;

  // Filter items if searching
  if (query) {
    activeFilteredItems = qrItems.filter(item => 
      (item.name && item.name.toLowerCase().includes(query)) ||
      (item.content && item.content.toLowerCase().includes(query))
    );
  } else {
    activeFilteredItems = [...qrItems];
  }

  // Update count badge
  if (countBadge) {
    countBadge.textContent = `${qrItems.length} QR codes`;
  }

  // Handle empty states
  if (qrItems.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    noResultsState.classList.add('hidden');
    refreshIcons();
    return;
  }

  emptyState.classList.add('hidden');

  if (activeFilteredItems.length === 0) {
    container.innerHTML = '';
    noResultsState.classList.remove('hidden');
    refreshIcons();
    return;
  }

  noResultsState.classList.add('hidden');

  // Build card elements
  container.innerHTML = activeFilteredItems.map((item, index) => {
    const isFirst = index === 0;
    const isLast = index === activeFilteredItems.length - 1;
    const isUrl = item.type === 'url' || /^https?:\/\//i.test(item.content);

    return `
      <div 
        class="qr-card" 
        data-id="${item.id}"
        draggable="${query ? 'false' : 'true'}"
        role="listitem"
      >
        <!-- Reorder arrows and drag grip -->
        <div class="card-order-controls" onclick="event.stopPropagation()">
          <button 
            type="button" 
            class="btn-order btn-move-up" 
            data-id="${item.id}" 
            ${isFirst ? 'disabled' : ''} 
            title="Μετακίνηση επάνω"
            aria-label="Μετακίνηση επάνω"
          >
            <i data-lucide="arrow-up"></i>
          </button>
          <div class="drag-grip" title="Σύρετε για αλλαγή σειράς">
            <i data-lucide="arrow-up-down"></i>
          </div>
          <button 
            type="button" 
            class="btn-order btn-move-down" 
            data-id="${item.id}" 
            ${isLast ? 'disabled' : ''} 
            title="Μετακίνηση κάτω"
            aria-label="Μετακίνηση κάτω"
          >
            <i data-lucide="arrow-down"></i>
          </button>
        </div>

        <!-- Main Card Content (Click to open details) -->
        <div class="qr-card-main">
          <div class="qr-card-header">
            ${getTypeBadgeHtml(item.type)}
            <h4 class="qr-card-title">${escapeHtml(item.name)}</h4>
          </div>
          <p class="qr-card-preview">${escapeHtml(item.content)}</p>
          <span class="qr-card-meta">${formatDate(item.created_at)}</span>
        </div>

        <!-- Quick Card Action Buttons -->
        <div class="qr-card-actions" onclick="event.stopPropagation()">
          ${isUrl ? `
            <a 
              href="${escapeHtml(item.content)}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="btn-card-action" 
              title="Άνοιγμα συνδέσμου"
              aria-label="Άνοιγμα συνδέσμου"
            >
              <i data-lucide="external-link"></i>
            </a>
          ` : ''}
          <button 
            type="button" 
            class="btn-card-action btn-copy-card" 
            data-content="${escapeHtml(item.content)}" 
            title="Αντιγραφή περιεχομένου"
            aria-label="Αντιγραφή"
          >
            <i data-lucide="copy"></i>
          </button>
          <!-- Direct Delete button without opening -->
          <button 
            type="button" 
            class="btn-card-action btn-delete-card" 
            data-id="${item.id}" 
            title="Διαγραφή QR (χωρίς άνοιγμα)"
            aria-label="Διαγραφή QR"
          >
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  attachCardEventListeners();
  refreshIcons();
}

// Attach Event Listeners to cards
function attachCardEventListeners() {
  const cards = document.querySelectorAll('.qr-card');
  
  cards.forEach(card => {
    const id = card.dataset.id;
    const item = qrItems.find(i => i.id === id);
    if (!item) return;

    // Card click opens Details modal
    card.addEventListener('click', () => {
      openDetailsModal(item);
    });

    // Move Up button
    const btnUp = card.querySelector('.btn-move-up');
    if (btnUp) {
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        moveItem(id, -1);
      });
    }

    // Move Down button
    const btnDown = card.querySelector('.btn-move-down');
    if (btnDown) {
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        moveItem(id, 1);
      });
    }

    // Quick Copy button
    const btnCopy = card.querySelector('.btn-copy-card');
    if (btnCopy) {
      btnCopy.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(item.content);
          showToast('Αντιγράφηκε στο πρόχειρο!', 'success');
        } catch (err) {
          showToast('Αποτυχία αντιγραφής', 'error');
        }
      });
    }

    // Direct Delete button (without opening)
    const btnDelete = card.querySelector('.btn-delete-card');
    if (btnDelete) {
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDelete(item);
      });
    }

    // Drag and Drop reordering
    card.addEventListener('dragstart', (e) => {
      draggedItemId = id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.qr-card').forEach(c => c.classList.remove('drag-over'));
      draggedItemId = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId = card.dataset.id;
      if (draggedItemId && targetId && draggedItemId !== targetId) {
        handleDragDropReorder(draggedItemId, targetId);
      }
    });
  });
}

// Move item up (-1) or down (+1) in list order
async function moveItem(id, direction) {
  const currentIndex = qrItems.findIndex(i => i.id === id);
  if (currentIndex === -1) return;

  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= qrItems.length) return;

  // Swap in array
  const temp = qrItems[currentIndex];
  qrItems[currentIndex] = qrItems[targetIndex];
  qrItems[targetIndex] = temp;

  renderList();
  showToast('Η σειρά ενημερώθηκε', 'info', 1200);

  // Persist order
  qrItems = await saveOrder(qrItems);
}

// Handle Drag & Drop reorder
async function handleDragDropReorder(sourceId, targetId) {
  const sourceIndex = qrItems.findIndex(i => i.id === sourceId);
  const targetIndex = qrItems.findIndex(i => i.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) return;

  // Move element
  const [moved] = qrItems.splice(sourceIndex, 1);
  qrItems.splice(targetIndex, 0, moved);

  renderList();
  showToast('Η νέα σειρά αποθηκεύτηκε', 'info', 1500);

  // Persist order
  qrItems = await saveOrder(qrItems);
}

// ================= MODAL CONTROLLERS =================

// 1. Details Modal
async function openDetailsModal(item) {
  currentDetailsItem = item;
  const modal = document.getElementById('detailsModal');
  const nameEl = document.getElementById('detailsName');
  const typeBadgeEl = document.getElementById('detailsTypeBadge');
  const contentEl = document.getElementById('detailsContent');
  const dateEl = document.getElementById('detailsDate');
  const canvasEl = document.getElementById('detailsQrCanvas');
  const btnVisit = document.getElementById('btnVisitLink');

  nameEl.textContent = item.name;
  contentEl.textContent = item.content;
  dateEl.textContent = formatDate(item.created_at);

  // Type badge
  const isUrl = item.type === 'url' || /^https?:\/\//i.test(item.content);
  typeBadgeEl.textContent = item.type ? item.type.toUpperCase() : 'TEXT';
  typeBadgeEl.className = `badge-type ${isUrl ? 'type-url' : ''}`;

  if (isUrl) {
    btnVisit.classList.remove('hidden');
    btnVisit.href = item.content;
  } else {
    btnVisit.classList.add('hidden');
  }

  // Render QR Code onto canvas
  await renderQRCode(canvasEl, item.content, { width: 320 });

  modal.classList.remove('hidden');
  refreshIcons();
}

function closeDetailsModal() {
  const modal = document.getElementById('detailsModal');
  modal.classList.add('hidden');
  currentDetailsItem = null;
}

// 2. Save / Add / Edit Modal
function openSaveModal({ id = '', name = '', content = '' } = {}) {
  const modal = document.getElementById('saveModal');
  const titleEl = document.getElementById('saveModalTitle');
  const idInput = document.getElementById('editQrId');
  const nameInput = document.getElementById('qrNameInput');
  const contentInput = document.getElementById('qrContentInput');
  const typeBadge = document.getElementById('detectedTypeBadge');

  idInput.value = id;
  nameInput.value = name;
  contentInput.value = content;

  if (id) {
    titleEl.textContent = 'Επεξεργασία QR Code';
  } else {
    titleEl.textContent = 'Αποθήκευση QR Code';
  }

  const detected = detectType(content);
  typeBadge.textContent = detected.toUpperCase();

  modal.classList.remove('hidden');
  refreshIcons();

  setTimeout(() => {
    if (!name) nameInput.focus();
    else contentInput.focus();
  }, 100);
}

function closeSaveModal() {
  const modal = document.getElementById('saveModal');
  modal.classList.add('hidden');
  document.getElementById('saveQrForm').reset();
}

// 3. Scanner Modal
async function openScannerModal() {
  const modal = document.getElementById('scannerModal');
  modal.classList.remove('hidden');
  refreshIcons();

  try {
    const result = await startScanner({
      elementId: 'cameraViewport',
      onScanSuccess: (decodedText) => {
        // Successful scan!
        closeScannerModal();
        showToast('Το QR αναγνωρίστηκε επιτυχώς!', 'success');
        openSaveModal({
          name: '',
          content: decodedText
        });
      },
      onScanError: () => {
        // Frame did not contain QR, normal continuous scanning
      }
    });

    const torchBtn = document.getElementById('btnToggleTorch');
    if (result && result.hasTorch) {
      torchBtn.classList.remove('hidden');
    } else {
      torchBtn.classList.add('hidden');
    }
  } catch (err) {
    console.error('Camera start error:', err);
    showToast(err.message || 'Δεν ήταν δυνατή η εκκίνηση της κάμερας', 'error');
    closeScannerModal();
  }
}

async function closeScannerModal() {
  const modal = document.getElementById('scannerModal');
  modal.classList.add('hidden');
  await stopScanner();
}

// 4. Delete Confirmation Dialog
function confirmDelete(item) {
  itemPendingDelete = item;
  const modal = document.getElementById('deleteModal');
  const textEl = document.getElementById('deleteConfirmText');
  textEl.innerHTML = `Θέλετε σίγουρα να διαγράψετε το QR: <strong>${escapeHtml(item.name)}</strong>;`;
  modal.classList.remove('hidden');
  refreshIcons();
}

function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  modal.classList.add('hidden');
  itemPendingDelete = null;
}

// 5. Settings Modal
async function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const config = getConfig();
  const urlInput = document.getElementById('supabaseUrlInput');
  const keyInput = document.getElementById('supabaseKeyInput');
  const sqlBlock = document.getElementById('sqlCodeBlock');
  const statusBox = document.getElementById('settingsStatusBox');
  const statusText = document.getElementById('settingsStatusText');

  urlInput.value = config.url || '';
  keyInput.value = config.key || '';
  sqlBlock.textContent = getSupabaseSql();

  // Test status
  if (config.url && config.key) {
    statusText.textContent = 'Έλεγχος σύνδεσης στο Supabase...';
    statusBox.className = 'status-callout';
    const res = await testConnection(config.url, config.key);
    if (res.success) {
      statusBox.className = 'status-callout connected';
      statusText.textContent = '🟢 Επιτυχής σύνδεση με το Supabase!';
    } else {
      statusBox.className = 'status-callout';
      statusText.textContent = `⚠️ Σφάλμα σύνδεσης: ${res.error}`;
    }
  } else {
    statusBox.className = 'status-callout';
    statusText.textContent = '🟠 Λειτουργία τοπικής μνήμης (Offline LocalStorage).';
  }

  modal.classList.remove('hidden');
  refreshIcons();
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  modal.classList.add('hidden');
}

// ================= APP INITIALIZATION & EVENT BINDINGS =================

async function initApp() {
  // 1. Initial Icon Setup
  refreshIcons();

  // 2. Fetch QRs
  try {
    qrItems = await fetchAllQRs();
  } catch (err) {
    console.error('Error fetching initial QRs:', err);
    qrItems = [];
  }
  updateSyncBadge();
  renderList();

  // 3. Search and Filter
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchInput.value) {
        btnClearSearch.classList.remove('hidden');
      } else {
        btnClearSearch.classList.add('hidden');
      }
      renderList();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      btnClearSearch.classList.add('hidden');
      renderList();
      searchInput.focus();
    });
  }

  // 4. Scanner Controls
  const btnScanQR = document.getElementById('btnScanQR');
  const btnEmptyScan = document.getElementById('btnEmptyScan');
  const btnCloseScanner = document.getElementById('btnCloseScanner');
  const btnToggleTorch = document.getElementById('btnToggleTorch');
  const btnUploadImage = document.getElementById('btnUploadImage');
  const fileQrInput = document.getElementById('fileQrInput');

  btnScanQR?.addEventListener('click', openScannerModal);
  btnEmptyScan?.addEventListener('click', openScannerModal);
  btnCloseScanner?.addEventListener('click', closeScannerModal);

  btnToggleTorch?.addEventListener('click', async () => {
    const isTorchOn = await toggleTorch();
    if (isTorchOn) {
      btnToggleTorch.classList.add('active');
    } else {
      btnToggleTorch.classList.remove('active');
    }
  });

  // Image Upload Scanner
  btnUploadImage?.addEventListener('click', () => {
    fileQrInput.click();
  });

  fileQrInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Ανάλυση εικόνας...', 'info');
      const text = await scanImageFile(file);
      await closeScannerModal();
      showToast('Το QR διαβάστηκε επιτυχώς!', 'success');
      openSaveModal({ name: '', content: text });
    } catch (err) {
      showToast('Δεν βρέθηκε έγκυρο QR code στην επιλεγμένη εικόνα', 'error');
    } finally {
      fileQrInput.value = '';
    }
  });

  // 5. Manual Add QR
  const btnOpenManualAdd = document.getElementById('btnOpenManualAdd');
  const btnQuickAdd = document.getElementById('btnQuickAdd');
  const btnEmptyManual = document.getElementById('btnEmptyManual');
  const btnCloseSaveModal = document.getElementById('btnCloseSaveModal');
  const btnCancelSave = document.getElementById('btnCancelSave');
  const saveQrForm = document.getElementById('saveQrForm');
  const qrContentInput = document.getElementById('qrContentInput');
  const detectedTypeBadge = document.getElementById('detectedTypeBadge');

  btnOpenManualAdd?.addEventListener('click', () => openSaveModal());
  btnQuickAdd?.addEventListener('click', () => openSaveModal());
  btnEmptyManual?.addEventListener('click', () => openSaveModal());
  btnCloseSaveModal?.addEventListener('click', closeSaveModal);
  btnCancelSave?.addEventListener('click', closeSaveModal);

  qrContentInput?.addEventListener('input', () => {
    const type = detectType(qrContentInput.value);
    detectedTypeBadge.textContent = type.toUpperCase();
  });

  // Save / Update Form Submission
  saveQrForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editQrId').value;
    const name = document.getElementById('qrNameInput').value.trim();
    const content = qrContentInput.value.trim();

    if (!content) {
      showToast('Το περιεχόμενο του QR είναι απαραίτητο', 'error');
      return;
    }

    try {
      if (id) {
        // Edit existing
        const updated = await updateQR(id, { name, content });
        const idx = qrItems.findIndex(i => i.id === id);
        if (idx !== -1 && updated) qrItems[idx] = updated;
        showToast('Το QR αποθηκεύτηκε επιτυχώς!', 'success');

        // If details modal was open, refresh details
        if (currentDetailsItem && currentDetailsItem.id === id) {
          openDetailsModal(updated);
        }
      } else {
        // Add new
        const created = await addQR({ name, content });
        qrItems.push(created);
        showToast('Νέο QR προστέθηκε!', 'success');
      }

      closeSaveModal();
      renderList();
    } catch (err) {
      showToast('Σφάλμα αποθήκευσης: ' + err.message, 'error');
    }
  });

  // 6. Details Modal Actions
  const btnCloseDetails = document.getElementById('btnCloseDetails');
  const btnCopyContent = document.getElementById('btnCopyContent');
  const btnDownloadQr = document.getElementById('btnDownloadQr');
  const btnEditFromDetails = document.getElementById('btnEditFromDetails');
  const btnDeleteFromDetails = document.getElementById('btnDeleteFromDetails');

  btnCloseDetails?.addEventListener('click', closeDetailsModal);

  btnCopyContent?.addEventListener('click', async () => {
    if (!currentDetailsItem) return;
    try {
      await navigator.clipboard.writeText(currentDetailsItem.content);
      showToast('Το περιεχόμενο αντιγράφηκε στο πρόχειρο!', 'success');
    } catch (e) {
      showToast('Αποτυχία αντιγραφής', 'error');
    }
  });

  btnDownloadQr?.addEventListener('click', () => {
    if (!currentDetailsItem) return;
    const canvas = document.getElementById('detailsQrCanvas');
    const safeName = (currentDetailsItem.name || 'qr-code').toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadCanvasAsImage(canvas, `${safeName}.png`);
    showToast('Η εικόνα QR αποθηκεύτηκε!', 'success');
  });

  btnEditFromDetails?.addEventListener('click', () => {
    if (!currentDetailsItem) return;
    const item = currentDetailsItem;
    closeDetailsModal();
    openSaveModal({ id: item.id, name: item.name, content: item.content });
  });

  btnDeleteFromDetails?.addEventListener('click', () => {
    if (!currentDetailsItem) return;
    const item = currentDetailsItem;
    closeDetailsModal();
    confirmDelete(item);
  });

  // 7. Delete Confirmation Actions
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');

  btnCancelDelete?.addEventListener('click', closeDeleteModal);

  btnConfirmDelete?.addEventListener('click', async () => {
    if (!itemPendingDelete) return;
    const deletedId = itemPendingDelete.id;
    try {
      await deleteQR(deletedId);
      qrItems = qrItems.filter(i => i.id !== deletedId);
      showToast('Το QR διαγράφηκε', 'info');
      closeDeleteModal();
      renderList();
    } catch (err) {
      showToast('Σφάλμα κατά τη διαγραφή: ' + err.message, 'error');
    }
  });

  // 8. Settings & Cloud Supabase Actions
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnBottomSettings = document.getElementById('btnBottomSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const settingsForm = document.getElementById('settingsForm');
  const btnCopySql = document.getElementById('btnCopySql');
  const btnSyncLocalToCloud = document.getElementById('btnSyncLocalToCloud');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnImportJsonTrigger = document.getElementById('btnImportJsonTrigger');
  const jsonFileInput = document.getElementById('jsonFileInput');

  btnOpenSettings?.addEventListener('click', openSettingsModal);
  btnBottomSettings?.addEventListener('click', openSettingsModal);
  btnCloseSettings?.addEventListener('click', closeSettingsModal);

  btnCopySql?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getSupabaseSql());
      showToast('Το SQL script αντιγράφηκε στο πρόχειρο!', 'success');
    } catch (e) {
      showToast('Αποτυχία αντιγραφής', 'error');
    }
  });

  settingsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('supabaseUrlInput').value.trim();
    const key = document.getElementById('supabaseKeyInput').value.trim();

    if (url && key) {
      showToast('Έλεγχος σύνδεσης...', 'info');
      const test = await testConnection(url, key);
      if (!test.success) {
        showToast('Σφάλμα σύνδεσης: ' + test.error, 'error', 4500);
        return;
      }
    }

    saveConfig(url, key);
    updateSyncBadge();
    showToast('Οι ρυθμίσεις αποθηκεύτηκαν!', 'success');

    // Reload list from newly connected source
    try {
      qrItems = await fetchAllQRs();
      renderList();
    } catch (e) {
      console.warn(e);
    }
    closeSettingsModal();
  });

  btnSyncLocalToCloud?.addEventListener('click', async () => {
    showToast('Μεταφόρτωση δεδομένων στο Supabase...', 'info');
    const res = await syncLocalToCloud();
    if (res.success) {
      showToast(`Μεταφορτώθηκαν ${res.count} QR codes στο Cloud!`, 'success');
      qrItems = await fetchAllQRs();
      renderList();
    } else {
      showToast('Σφάλμα συγχρονισμού: ' + res.error, 'error', 4000);
    }
  });

  // Export JSON Backup
  btnExportJson?.addEventListener('click', () => {
    if (!qrItems || qrItems.length === 0) {
      showToast('Δεν υπάρχουν ακόμη αποθηκευμένα QR codes για εξαγωγή.', 'info');
      return;
    }
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: qrItems.length,
      items: qrItems
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `qr-vault-backup-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast(`Εξήχθησαν ${qrItems.length} QR codes σε αρχείο JSON!`, 'success');
  });

  // Import JSON Backup
  btnImportJsonTrigger?.addEventListener('click', () => {
    if (jsonFileInput) jsonFileInput.click();
  });

  jsonFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const list = Array.isArray(parsed) 
          ? parsed 
          : (parsed.items || parsed.qrCodes || parsed.data || []);

        if (!Array.isArray(list) || list.length === 0) {
          throw new Error('Το αρχείο δεν περιέχει έγκυρα δεδομένα QR codes.');
        }

        let addedCount = 0;
        for (const item of list) {
          if (!item) continue;
          const name = (item.name || item.title || 'Εισαγόμενο QR').trim();
          const content = (item.content || item.url || item.text || item.value || '').trim();
          if (content) {
            await addQR({ name, content });
            addedCount++;
          }
        }

        if (addedCount === 0) {
          throw new Error('Δεν βρέθηκαν έγκυρα QR codes με περιεχόμενο στο αρχείο.');
        }

        qrItems = await fetchAllQRs();
        renderList();
        refreshIcons();
        showToast(`Εισήχθησαν επιτυχώς ${addedCount} QR codes!`, 'success');
      } catch (err) {
        showToast('Σφάλμα εισαγωγής JSON: ' + (err.message || 'Μη έγκυρο αρχείο'), 'error', 4000);
      } finally {
        jsonFileInput.value = '';
      }
    };
    reader.readAsText(file);
  });

  // 9. Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal.id === 'scannerModal') closeScannerModal();
        else if (modal.id === 'saveModal') closeSaveModal();
        else if (modal.id === 'detailsModal') closeDetailsModal();
        else if (modal.id === 'settingsModal') closeSettingsModal();
        else if (modal.id === 'deleteModal') closeDeleteModal();
      }
    });
  });

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeScannerModal();
      closeSaveModal();
      closeDetailsModal();
      closeSettingsModal();
      closeDeleteModal();
    }
  });

  // 10. PWA Installation Prompt Handling
  const pwaBanner = document.getElementById('pwaBanner');
  const btnInstallPwa = document.getElementById('btnInstallPwa');
  const btnDismissPwa = document.getElementById('btnDismissPwa');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    pwaBanner?.classList.remove('hidden');
    refreshIcons();
  });

  btnInstallPwa?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('Η εφαρμογή εγκαταστάθηκε!', 'success');
    }
    deferredInstallPrompt = null;
    pwaBanner?.classList.add('hidden');
  });

  btnDismissPwa?.addEventListener('click', () => {
    pwaBanner?.classList.add('hidden');
  });

  // 11. Register Service Worker for PWA
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(
        (reg) => console.log('Service Worker registered with scope:', reg.scope),
        (err) => console.warn('Service Worker registration failed:', err)
      );
    });
  }
}

// Boot application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
