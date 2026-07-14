// ==================== Audio Chime Synthesis ====================
function playSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);
    
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
    gain2.gain.setValueAtTime(0.15, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.error('Failed to play success sound:', e);
  }
}

// ==================== State ====================
let audioFile = null;
let leftLogoFile = null;
let rightLogoFile = null;
let selectedAnimation = 'reveal';
let captionTop = 65;

let transcribeData = null; // Holds the JSON returned from /api/transcribe
let activeSegmentIndex = -1;
let currentTime = 0;

// ==================== UI View Elements ====================
const uploadState = document.getElementById('upload-state');
const loadingState = document.getElementById('loading-state');
const successState = document.getElementById('success-state');
const errorState = document.getElementById('error-state');

// ==================== Form Elements ====================
const formControls = document.getElementById('form-controls');
const submitBtn = document.getElementById('submit-btn');
const progressMsg = document.getElementById('progress-msg');
const errorMsg = document.getElementById('error-msg');
const outputVideo = document.getElementById('output-video');
const downloadLink = document.getElementById('download-link');
let apiUrl = 'https://ahmedyehia-rekaption.hf.space';
let audioApiUrl = 'https://youtube-audio-backend-production-a2d5.up.railway.app'; // رابط خدمة تحميل الصوت (الـ Railway المخصص للصوت)
const apiUrlInput = document.getElementById('api-url');
if (apiUrlInput) {
  apiUrlInput.value = apiUrl;
  apiUrlInput.addEventListener('input', function() {
    apiUrl = this.value.trim().replace(/\/$/, '');
  });
}

// ==================== Visitor Analytics & Tracking ====================
let visitorId = localStorage.getItem('visitor_id');
let isNewVisitor = false;
if (!visitorId) {
  visitorId = 'visitor_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  localStorage.setItem('visitor_id', visitorId);
  isNewVisitor = true;
}

// ==================== Firebase Firestore Persistent System ====================
let isSuspended = false;

async function syncUserWithFirestore(user) {
  if (!window.firebaseDb) {
    console.warn("Firestore is not initialized yet.");
    return null;
  }
  try {
    const userRef = window.firebaseDb.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (doc.exists) {
      return doc.data();
    } else {
      const newUserData = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email,
        whatsapp: null,
        is_active: true,
        renders_count: 0,
        created_at: new Date().toISOString()
      };
      await userRef.set(newUserData);
      return newUserData;
    }
  } catch (err) {
    console.error("Error syncing user with Firestore:", err);
    return null;
  }
}

async function trackEventFirestore(eventType, isNew = false) {
  if (!window.firebaseDb) {
    // Retry once when Firebase finishes initializing
    setTimeout(() => {
      if (window.firebaseDb) {
        window.firebaseDb.collection('analytics').add({
          visitor_id: visitorId,
          event_type: eventType,
          is_new: isNew,
          timestamp: new Date().toISOString()
        }).catch(e => console.warn(e));
      }
    }, 2000);
    return;
  }
  try {
    await window.firebaseDb.collection('analytics').add({
      visitor_id: visitorId,
      event_type: eventType,
      is_new: isNew,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Failed to track event in Firestore:", err);
  }
}

// Track Visit Event on load
trackEventFirestore('visit', isNewVisitor);
fetch(`${apiUrl.replace(/\/$/, '')}/api/track`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    visitor_id: visitorId,
    event_type: 'visit',
    is_new: isNewVisitor
  })
}).catch(err => console.warn('Tracking visit failed:', err));

// Log Firebase Analytics Event
try {
  window.logFirebaseEvent?.('visit', { is_new: isNewVisitor, visitor_id: visitorId });
} catch (_) {}

function trackAction(eventType) {
  trackEventFirestore(eventType, false);
  fetch(`${apiUrl.replace(/\/$/, '')}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitor_id: visitorId,
      event_type: eventType,
      is_new: false
    })
  }).catch(err => console.warn(`Tracking event ${eventType} failed:`, err));

  try {
    window.logFirebaseEvent?.(eventType === 'upload' ? 'upload_media' : 'render_video', { visitor_id: visitorId });
  } catch (_) {}
}

// ==================== Admin Dashboard UI Functions ====================
let adminToken = '';

function openAdminModal() {
  document.getElementById('admin-modal').style.display = 'flex';
  document.getElementById('admin-login-screen').style.display = 'block';
  document.getElementById('admin-dashboard-screen').style.display = 'none';
  document.getElementById('admin-login-error').style.display = 'none';
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  const errorDiv = document.getElementById('admin-login-error');
  
  errorDiv.style.display = 'none';
  
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      throw new Error('بيانات الدخول غير صحيحة');
    }
    
    const data = await response.json();
    adminToken = data.token;
    
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-dashboard-screen').style.display = 'block';
    
    refreshAdminStats();
  } catch (err) {
    errorDiv.textContent = err.message || 'بيانات الدخول غير صحيحة';
    errorDiv.style.display = 'block';
  }
}

async function refreshAdminStats() {
  if (!adminToken) return;
  if (!window.firebaseDb) {
    alert("برجاء الانتظار، جاري تهيئة قاعدة بيانات فايربيز...");
    return;
  }
  
  try {
    // 1. Fetch all users from Firestore
    const usersSnapshot = await window.firebaseDb.collection('users').orderBy('created_at', 'desc').get();
    const usersList = [];
    usersSnapshot.forEach(doc => {
      usersList.push(doc.data());
    });
    
    // 2. Fetch all analytics events from Firestore
    const analyticsSnapshot = await window.firebaseDb.collection('analytics').orderBy('timestamp', 'desc').get();
    const eventsList = [];
    analyticsSnapshot.forEach(doc => {
      eventsList.push(doc.data());
    });
    
    // Calculate Stats
    const totalVisits = eventsList.filter(e => e.event_type === 'visit').length;
    const newVisits = eventsList.filter(e => e.event_type === 'visit' && e.is_new === true).length;
    const returningVisits = eventsList.filter(e => e.event_type === 'visit' && e.is_new !== true).length;
    const totalUploads = eventsList.filter(e => e.event_type === 'upload').length;
    const totalRenders = eventsList.filter(e => e.event_type === 'render').length;
    const totalUsers = usersList.length;
    
    // Update Badge UI
    document.getElementById('stat-total-visits').textContent = totalVisits;
    document.getElementById('stat-new-visits').textContent = newVisits;
    document.getElementById('stat-returning-visits').textContent = returningVisits;
    document.getElementById('stat-total-uploads').textContent = totalUploads;
    document.getElementById('stat-total-renders').textContent = totalRenders;
    
    const statTotalUsers = document.getElementById('stat-total-users');
    if (statTotalUsers) {
      statTotalUsers.textContent = totalUsers;
    }
    
    // 3. Update Events Log Table (Recent 50)
    const tbody = document.getElementById('admin-events-log-body');
    tbody.innerHTML = '';
    
    const recentEvents = eventsList.slice(0, 50);
    if (recentEvents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding: 30px; text-align: center; color: rgba(255,255,255,0.4);">لا توجد أحداث مسجلة بعد</td></tr>`;
    } else {
      recentEvents.forEach(e => {
        const timeStr = e.timestamp ? new Date(e.timestamp).toLocaleString('ar-EG') : '';
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
        
        let typeBadge = '';
        if (e.event_type === 'visit') {
          typeBadge = '<span style="color: #a78bfa;">👁️ زيارة للموقع</span>';
        } else if (e.event_type === 'upload') {
          typeBadge = '<span style="color: #fbbf24;">📤 تفريغ صوتي (رفع)</span>';
        } else if (e.event_type === 'render') {
          typeBadge = '<span style="color: #f472b6;">🎬 رندرة فيديو</span>';
        }
        
        const userBadge = e.is_new 
          ? '<span style="background: rgba(16, 185, 129, 0.1); color: #34d399; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">زائر جديد</span>'
          : '<span style="background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 600;">زائر متكرر</span>';
        
        tr.innerHTML = `
          <td style="padding: 12px 15px; font-family: monospace; color: rgba(255,255,255,0.4); font-size: 11px;">${e.visitor_id ? e.visitor_id.substring(0, 8) : ''}</td>
          <td style="padding: 12px 15px; font-weight: 600;">${typeBadge}</td>
          <td style="padding: 12px 15px;">${userBadge}</td>
          <td style="padding: 12px 15px; color: rgba(255,255,255,0.5); font-size: 11px;">${timeStr}</td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    // 4. Update Users Log Table (Recent 50)
    const usersTbody = document.getElementById('admin-users-log-body');
    if (usersTbody) {
      usersTbody.innerHTML = '';
      if (usersList.length === 0) {
        usersTbody.innerHTML = `<tr><td colspan="7" style="padding: 30px; text-align: center; color: rgba(255,255,255,0.4);">لا يوجد أعضاء مسجلين بعد</td></tr>`;
      } else {
        const recentUsers = usersList.slice(0, 50);
        recentUsers.forEach(u => {
          const timeStr = u.created_at ? new Date(u.created_at).toLocaleString('ar-EG') : '';
          const is_active = u.is_active !== false;
          const statusText = is_active ? '<span style="color:#10b981; font-weight:bold;">نشط</span>' : '<span style="color:#ef4444; font-weight:bold;">موقوف</span>';
          const btnText = is_active ? 'إيقاف 🚫' : 'تفعيل ✅';
          const btnColor = is_active ? '#ef4444' : '#10b981';
          const btnBg = is_active ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';
          const btnBorder = is_active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
          
          const rendersCount = u.renders_count !== undefined ? u.renders_count : 0;
          
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
          tr.innerHTML = `
            <td style="padding: 12px 15px; font-weight: 600;">${u.name || ''}</td>
            <td style="padding: 12px 15px; color: rgba(255,255,255,0.6);">${u.email || ''}</td>
            <td style="padding: 12px 15px; color: var(--purple-accent); font-weight: 600; text-align: center;">${u.whatsapp || 'غير مسجل'}</td>
            <td style="padding: 12px 15px; color: rgba(255,255,255,0.5); font-size: 11px;">${timeStr}</td>
            <td style="padding: 12px 15px; text-align: center; color: #fbbf24; font-weight: bold;">${rendersCount}</td>
            <td style="padding: 12px 15px; text-align: center;">${statusText}</td>
            <td style="padding: 12px 15px; text-align: center;">
              <button onclick="toggleUserStatus('${u.uid}', ${is_active})" style="padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; color: ${btnColor}; background: ${btnBg}; border: 1px solid ${btnBorder};">
                ${btnText}
              </button>
            </td>
          `;
          usersTbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error("Error refreshing stats from Firestore:", err);
    alert('حدث خطأ أثناء جلب البيانات من فايربيز: ' + err.message);
  }
}

window.toggleUserStatus = async function(uid, is_active) {
  if (!confirm(`هل أنت متأكد من تغيير حالة هذا الحساب؟`)) return;
  try {
    if (!window.firebaseDb) {
      alert("قاعدة بيانات فايربيز غير جاهزة بعد");
      return;
    }
    await window.firebaseDb.collection('users').doc(uid).update({
      is_active: !is_active
    });
    refreshAdminStats();
  } catch (err) {
    alert('حدث خطأ أثناء تعديل حالة الحساب: ' + err.message);
  }
};

function handleAdminLogout() {
  adminToken = '';
  document.getElementById('admin-email').value = '';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-login-screen').style.display = 'block';
  document.getElementById('admin-dashboard-screen').style.display = 'none';
}

// ==================== Upload Tab Handling ====================
let currentUploadSource = 'local';

window.switchUploadTab = function(tab) {
  const localBtn = document.getElementById('tab-local');
  const youtubeBtn = document.getElementById('tab-youtube');
  const localContent = document.getElementById('tab-content-local');
  const youtubeContent = document.getElementById('tab-content-youtube');
  
  if (tab === 'local') {
    localBtn.style.background = 'rgba(255,255,255,0.05)';
    localBtn.style.borderColor = 'rgba(255,255,255,0.1)';
    localBtn.style.color = '#fff';
    
    youtubeBtn.style.background = 'transparent';
    youtubeBtn.style.borderColor = 'transparent';
    youtubeBtn.style.color = 'rgba(255,255,255,0.6)';
    
    localContent.style.display = 'block';
    youtubeContent.style.display = 'none';
    currentUploadSource = 'local';
    
    if (audioFile) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
  } else {
    youtubeBtn.style.background = 'rgba(255,255,255,0.05)';
    youtubeBtn.style.borderColor = 'rgba(255,255,255,0.1)';
    youtubeBtn.style.color = '#fff';
    
    localBtn.style.background = 'transparent';
    localBtn.style.borderColor = 'transparent';
    localBtn.style.color = 'rgba(255,255,255,0.6)';
    
    localContent.style.display = 'none';
    youtubeContent.style.display = 'block';
    currentUploadSource = 'youtube';
    
    const ytUrl = document.getElementById('youtube-url-input').value.trim();
    if (ytUrl) {
      submitBtn.disabled = false;
    } else {
      submitBtn.disabled = true;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const ytInput = document.getElementById('youtube-url-input');
  if (ytInput) {
    ytInput.addEventListener('input', function() {
      if (currentUploadSource === 'youtube') {
        submitBtn.disabled = !this.value.trim();
      }
    });
  }
});

// ==================== Audio Dropzone Handling ====================
const audioInput = document.getElementById('audio-input');
const audioDropzone = document.getElementById('audio-dropzone');
const audioLabel = document.getElementById('audio-label');

audioInput.addEventListener('change', function() {
  if (this.files && this.files[0]) {
    handleAudioSelect(this.files[0]);
  }
});

audioDropzone.addEventListener('dragover', function(e) {
  e.preventDefault();
  this.classList.add('active');
});
audioDropzone.addEventListener('dragleave', function() {
  if (!audioFile) this.classList.remove('active');
});
audioDropzone.addEventListener('drop', function(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleAudioSelect(e.dataTransfer.files[0]);
    audioInput.files = e.dataTransfer.files;
  }
});

function handleAudioSelect(file) {
  audioFile = file;
  audioLabel.textContent = file.name;
  audioDropzone.classList.add('active');
  submitBtn.disabled = false;
}

// ==================== Logo Upload & Preview Handling ====================
const leftLogoInput = document.getElementById('left-logo-input');
const rightLogoInput = document.getElementById('right-logo-input');
const leftLogoContent = document.getElementById('left-logo-content');
const rightLogoContent = document.getElementById('right-logo-content');

leftLogoInput.addEventListener('change', function() {
  if (this.files && this.files[0]) {
    leftLogoFile = this.files[0];
    showLogoPreview(leftLogoContent, leftLogoFile, 'left');
  }
});

rightLogoInput.addEventListener('change', function() {
  if (this.files && this.files[0]) {
    rightLogoFile = this.files[0];
    showLogoPreview(rightLogoContent, rightLogoFile, 'right');
  }
});

function showLogoPreview(container, file, side) {
  const url = URL.createObjectURL(file);
  container.innerHTML = `
    <img src="${url}" class="preview-thumbnail" alt="${side} logo preview" />
    <button type="button" class="clear-btn" onclick="event.stopPropagation(); clearLogo('${side}')">&times;</button>
  `;
}

window.clearLogo = function(side) {
  if (side === 'left') {
    leftLogoFile = null;
    leftLogoInput.value = '';
    leftLogoContent.innerHTML = `
      <span class="file-box-icon">🖼️</span>
      <span class="file-box-text">شعار أعلى اليسار</span>
    `;
  } else {
    rightLogoFile = null;
    rightLogoInput.value = '';
    rightLogoContent.innerHTML = `
      <span class="file-box-icon">🖼️</span>
      <span class="file-box-text">شعار أعلى اليمين</span>
    `;
  }
};

// ==================== Animation Styles Selection & Synchronization ====================
window.selectUploadAnimation = function(el) {
  document.querySelectorAll('.upload-anim-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedAnimation = el.dataset.anim;
  
  // Sync to editor animation cards
  const editorCard = document.querySelector(`.anim-card[data-anim="${selectedAnimation}"]`);
  if (editorCard) {
    document.querySelectorAll('.anim-card').forEach(c => c.classList.remove('selected'));
    editorCard.classList.add('selected');
  }
};

window.selectAnimation = function(el) {
  document.querySelectorAll('.anim-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedAnimation = el.dataset.anim;
  
  // Sync to upload animation cards
  const uploadCard = document.querySelector(`.upload-anim-card[data-anim="${selectedAnimation}"]`);
  if (uploadCard) {
    document.querySelectorAll('.upload-anim-card').forEach(c => c.classList.remove('selected'));
    uploadCard.classList.add('selected');
  }
};

window.updateCaptionTop = function(val) {
  captionTop = parseInt(val) || 65;
  const valSpan = document.getElementById('caption-top-val');
  if (valSpan) valSpan.textContent = `${captionTop}%`;
  
  const overlayContainer = document.getElementById('live-caption-overlay');
  if (overlayContainer) {
    overlayContainer.style.top = `${captionTop}%`;
  }
};

function updateRangeLabel(id, value) {
  const valSpan = document.getElementById(id + '-val');
  if (valSpan) valSpan.textContent = value;
}

function bindSyncedInputs(id1, id2, isColor = false) {
  const el1 = document.getElementById(id1);
  const el2 = document.getElementById(id2);
  if (!el1 || !el2) return;
  
  el1.addEventListener('input', function() {
    el2.value = this.value;
    updateRangeLabel(id1, this.value);
    updateRangeLabel(id2, this.value);
    if (isColor) {
      const hexText = document.getElementById(id2 + '-hex');
      if (hexText) hexText.textContent = this.value.toUpperCase();
    }
    el2.dispatchEvent(new Event('input'));
  });
  
  el2.addEventListener('input', function() {
    el1.value = this.value;
    updateRangeLabel(id1, this.value);
    updateRangeLabel(id2, this.value);
    if (isColor) {
      const hexText = document.getElementById(id1 + '-hex');
      if (hexText) hexText.textContent = this.value.toUpperCase();
    }
    if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
  });
}

// Binds all upload-side controls to editor-side controls
document.addEventListener('DOMContentLoaded', () => {
  bindSyncedInputs('upload-active-color', 'active-color', true);
  bindSyncedInputs('upload-inactive-color', 'inactive-color', true);
  bindSyncedInputs('upload-bg-color', 'bg-color', true);
  bindSyncedInputs('upload-font-size', 'font-size');
  bindSyncedInputs('upload-bg-opacity', 'bg-opacity');
  bindSyncedInputs('upload-sync-offset', 'sync-offset');
  bindSyncedInputs('upload-word-spacing', 'word-spacing');
  bindSyncedInputs('upload-bg-padding', 'bg-padding');

  // Bind show-bg checkboxes
  const uploadShowBg = document.getElementById('upload-show-bg');
  const showBg = document.getElementById('show-bg');
  if (uploadShowBg && showBg) {
    uploadShowBg.addEventListener('change', function() {
      showBg.checked = this.checked;
      if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
    });
    showBg.addEventListener('change', function() {
      uploadShowBg.checked = this.checked;
      if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
    });
  }

  // Initialize all range labels
  ['upload-bg-opacity', 'upload-word-spacing', 'upload-bg-padding', 'bg-opacity', 'word-spacing', 'bg-padding'].forEach(id => {
    const el = document.getElementById(id);
    if (el) updateRangeLabel(id, el.value);
  });

  // Open Admin modal if hash is #admin or url contains ?admin
  if (window.location.hash === '#admin' || window.location.search.includes('admin')) {
    openAdminModal();
  }
});

window.syncShowBg = function(el) {
  const uploadShowBg = document.getElementById('upload-show-bg');
  const showBg = document.getElementById('show-bg');
  if (uploadShowBg && showBg) {
    uploadShowBg.checked = el.checked;
    showBg.checked = el.checked;
    if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
  }
};

// ==================== Color Pickers Casing & Live Updates ====================
document.getElementById('active-color').addEventListener('input', function() {
  document.getElementById('active-color-hex').textContent = this.value.toUpperCase();
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
});
document.getElementById('inactive-color').addEventListener('input', function() {
  document.getElementById('inactive-color-hex').textContent = this.value.toUpperCase();
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
});
document.getElementById('bg-color').addEventListener('input', function() {
  document.getElementById('bg-color-hex').textContent = this.value.toUpperCase();
  if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
});

// Other styling changes trigger live refresh
['font-size', 'bg-opacity', 'word-spacing', 'bg-padding'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      if (typeof updateLiveCaptionOverlay === 'function') updateLiveCaptionOverlay(currentTime);
    });
  }
});

// ==================== Advanced Settings panel toggler ====================
window.toggleAdvanced = function() {
  const panel = document.getElementById('advanced-panel');
  panel.classList.toggle('hidden');
};

// ==================== View State Managers ====================
function showState(visibleElement) {
  [uploadState, loadingState, successState, errorState].forEach(el => {
    el.classList.add('hidden');
  });
  visibleElement.classList.remove('hidden');
}

window.resetApp = function() {
  // Clear file states
  audioFile = null;
  audioInput.value = '';
  audioLabel.textContent = 'قم بسحب ملف الصوت أو الفيديو هنا أو انقر للاختيار';
  audioDropzone.classList.remove('active');
  
  const ytInput = document.getElementById('youtube-url-input');
  if (ytInput) ytInput.value = '';
  switchUploadTab('local');
  
  submitBtn.disabled = true;
  
  clearLogo('left');
  clearLogo('right');
  
  transcribeData = null;
  activeSegmentIndex = -1;
  currentTime = 0;
  
  // Hide editor, show main dashboard
  document.getElementById('editor-state').classList.add('hidden');
  document.getElementById('main-dashboard').classList.remove('hidden');
  
  showState(uploadState);
};

// Helper to convert hex to rgb for background opacity
function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

// ==================== Silence/Snooze Check Helper ====================
function isSpeaking(segment, time) {
  if (!segment || !segment.words || segment.words.length === 0) return false;
  return segment.words.some(w => time >= (w.start - 0.05) && time <= (w.end + 0.05));
}

// ==================== Media Player & Live Caption Overlay ====================
function initMediaPlayer() {
  const wrapper = document.getElementById('preview-wrapper');
  if (!wrapper || !transcribeData) return;
  
  const mediaUrl = `${apiUrl}/public/${transcribeData.audioPath}`;
  
  let mediaHtml = '';
  if (transcribeData.videoPath) {
    wrapper.classList.remove('audio-mode');
    mediaHtml = `
      <video id="media-player" src="${mediaUrl}" class="preview-media-element" controls></video>
    `;
  } else {
    wrapper.classList.add('audio-mode');
    mediaHtml = `
      <div class="audio-equalizer-dots" style="margin-top: 20px;">
        <div class="audio-equalizer-dot"></div>
        <div class="audio-equalizer-dot"></div>
        <div class="audio-equalizer-dot"></div>
        <div class="audio-equalizer-dot"></div>
      </div>
      <audio id="media-player" src="${mediaUrl}" controls style="width: 90%; margin-bottom: 20px;"></audio>
    `;
  }
  
  mediaHtml += `
    <div id="live-caption-overlay" class="hidden" style="
      position: absolute;
      top: ${captionTop}%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: max-content;
      max-width: 95%;
      background: rgba(0, 0, 0, 0.61);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      text-align: center;
      pointer-events: none;
      z-index: 10;
      direction: rtl;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      font-size: 16px;
      font-weight: 800;
      font-family: 'Cairo', sans-serif;
      line-height: 1.5;
      display: flex;
      flex-wrap: nowrap;
      white-space: nowrap;
      justify-content: center;
    "></div>
  `;
  
  wrapper.innerHTML = mediaHtml;
  
  const player = document.getElementById('media-player');
  player.addEventListener('timeupdate', function() {
    updateActiveSegment(this.currentTime);
  });

  if (transcribeData.videoPath && player) {
    player.style.cursor = 'pointer';
    player.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      if (clickY > rect.height - 50) {
        return;
      }
      e.preventDefault();
      if (this.paused) {
        this.play();
      } else {
        this.pause();
      }
    });
  }
}

function updateActiveSegment(time) {
  if (!transcribeData) return;
  
  // Apply the syncOffset to the player's time for the caption overlay!
  const syncOffset = parseFloat(document.getElementById('sync-offset').value) || 0;
  const adjustedTime = time + syncOffset;
  
  currentTime = adjustedTime;
  let newActiveIndex = -1;
  for (let i = 0; i < transcribeData.segments.length; i++) {
    const seg = transcribeData.segments[i];
    if (adjustedTime >= seg.start && adjustedTime <= seg.end) {
      newActiveIndex = i;
      break;
    }
  }
  
  if (newActiveIndex !== activeSegmentIndex) {
    activeSegmentIndex = newActiveIndex;
    
    // Highlight active card
    document.querySelectorAll('.segment-card').forEach((card, idx) => {
      if (idx === activeSegmentIndex) {
        card.classList.add('active');
        
        // Smoothly auto-scroll this card into center view inside the right-side container
        const container = document.querySelector('.workspace-right');
        if (container) {
          const cardTop = card.offsetTop;
          const containerHeight = container.clientHeight;
          const cardHeight = card.offsetHeight;
          
          container.scrollTo({
            top: cardTop - (containerHeight / 2) + (cardHeight / 2),
            behavior: 'smooth'
          });
        }
      } else {
        card.classList.remove('active');
      }
    });

  }
  
  // Update live caption overlay with adjusted time
  updateLiveCaptionOverlay(adjustedTime);
}

function updateLiveCaptionOverlay(time) {
  const overlayContainer = document.getElementById('live-caption-overlay');
  if (!overlayContainer) return;
  
  if (activeSegmentIndex === -1 || !transcribeData) {
    overlayContainer.classList.add('hidden');
    overlayContainer.removeAttribute('data-rendered-key');
    return;
  }
  
  const segment = transcribeData.segments[activeSegmentIndex];
  
  overlayContainer.classList.remove('hidden');
  const activeColor = document.getElementById('active-color').value;
  const inactiveColor = document.getElementById('inactive-color').value;
  
  // Read dynamic style customizations
  const fontSize = parseFloat(document.getElementById('font-size').value) || 50;
  const bgColor = document.getElementById('bg-color').value;
  const bgOpacity = parseFloat(document.getElementById('bg-opacity').value) || 86;
  const wordSpacing = parseFloat(document.getElementById('word-spacing').value) || 31;
  const bgPadding = parseFloat(document.getElementById('bg-padding').value) || 8;
  const removeBg = document.getElementById('show-bg').checked;
  const isBgVisible = !removeBg && bgOpacity > 0;
  
  // Apply styles to overlay container dynamically
  overlayContainer.style.top = `${captionTop}%`;
  overlayContainer.style.fontSize = `${fontSize / 4.5}px`;
  overlayContainer.style.flexWrap = 'nowrap';
  overlayContainer.style.whiteSpace = 'nowrap';
  overlayContainer.style.columnGap = `${wordSpacing / 100}em`;
  overlayContainer.style.maxWidth = '95%';
  
  if (isBgVisible) {
    overlayContainer.style.background = `rgba(${hexToRgb(bgColor)}, ${bgOpacity / 100})`;
    overlayContainer.style.backdropFilter = 'none';
    overlayContainer.style.webkitBackdropFilter = 'none';
    overlayContainer.style.border = 'none'; // Clean sharp rectangular edge
    overlayContainer.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';
    overlayContainer.style.padding = `${bgPadding / 4.5}px ${(bgPadding * 2) / 4.5}px`;
    overlayContainer.style.borderRadius = `${4 / 4.5}px`; // tight corners scaled by 4.5
  } else {
    overlayContainer.style.background = 'none';
    overlayContainer.style.backdropFilter = 'none';
    overlayContainer.style.webkitBackdropFilter = 'none';
    overlayContainer.style.border = 'none';
    overlayContainer.style.boxShadow = 'none';
    overlayContainer.style.padding = '0';
    overlayContainer.style.borderRadius = '0';
  }
  
  const outlineStroke = isBgVisible 
    ? 'text-shadow: 2px 2px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000, 2px 0px 0px #000000, -2px 0px 0px #000000, 0px 2px 0px #000000, 0px -2px 0px #000000, 0px 4px 10px rgba(0, 0, 0, 0.95);'
    : 'text-shadow: 2px 2px 0px #000000, -2px -2px 0px #000000, 2px -2px 0px #000000, -2px 2px 0px #000000, 0px 4px 6px rgba(0, 0, 0, 0.8);';

  // React-style state key to avoid destroying the DOM and breaking slide-up transitions
  const styleKey = `${activeSegmentIndex}_${selectedAnimation}_${fontSize}_${bgColor}_${bgOpacity}_${wordSpacing}_${bgPadding}_${!removeBg}_${activeColor}_${inactiveColor}`;
  const isNewSegment = overlayContainer.getAttribute('data-rendered-key') !== styleKey;

  if (selectedAnimation === 'slide') {
    overlayContainer.style.overflow = 'hidden';
  } else {
    overlayContainer.style.overflow = 'visible';
  }

  if (isNewSegment) {
    overlayContainer.setAttribute('data-rendered-key', styleKey);
    let html = '';
    segment.words.forEach(w => {
      const isWordActive = time >= w.start && time <= w.end;
      const color = isWordActive ? activeColor : inactiveColor;
      
      let translateY = 0;
      let opacity = 1;
      let transitionStr = 'none';
      
      if (selectedAnimation === 'reveal') {
        const isPast = time > w.end;
        if (isWordActive || isPast) {
          translateY = 0;
          opacity = 1;
          transitionStr = 'transform 0.25s cubic-bezier(0.3, 1.5, 0.5, 1), opacity 0.2s ease-out';
        } else {
          translateY = 3.3; // 15px scaled by 4.5
          opacity = 0;
          transitionStr = 'none';
        }
      }
      
      const transformStr = selectedAnimation === 'reveal' ? `transform: translateY(${translateY}px);` : '';
      const opacityStr = selectedAnimation === 'reveal' ? `opacity: ${opacity};` : '';
      const transitionStyleStr = selectedAnimation === 'reveal' ? `transition: ${transitionStr};` : '';
      
      html += `<span class="caption-word" style="color: ${color}; ${outlineStroke} display: inline-block; ${transformStr} ${opacityStr} ${transitionStyleStr}">${w.word}</span>`;
    });
    
    if (selectedAnimation === 'slide') {
      const activeDuration = time - segment.start;
      const progress = Math.min(1, Math.max(0, activeDuration / 0.35));
      const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
      const t = easeOutQuart(progress);
      const translateY = 100 * (1 - t);
      const opacity = progress === 0 ? 0 : 1;

      overlayContainer.innerHTML = `<div class="slide-wrapper" style="
        display: flex;
        flex-wrap: nowrap;
        white-space: nowrap;
        justify-content: center;
        column-gap: ${wordSpacing / 100}em;
        transform: translateY(${translateY}%);
        opacity: ${opacity};
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease-out;
      ">${html}</div>`;
    } else {
      overlayContainer.innerHTML = `<div style="
        display: flex;
        flex-wrap: nowrap;
        white-space: nowrap;
        justify-content: center;
        column-gap: ${wordSpacing / 100}em;
      ">${html}</div>`;
    }
  } else {
    // Fast in-place DOM updates: update words highlights & reveal transitions smoothly without resetting keyframe animations
    const spans = overlayContainer.querySelectorAll('.caption-word');
    segment.words.forEach((w, idx) => {
      const span = spans[idx];
      if (span) {
        const isWordActive = time >= w.start && time <= w.end;
        const isPast = time > w.end;
        const color = isWordActive ? activeColor : inactiveColor;
        
        span.style.color = color;
        
        if (selectedAnimation === 'reveal') {
          let translateY = 3.3;
          let opacity = 0;
          let transitionStr = 'none';
          if (isWordActive || isPast) {
            translateY = 0;
            opacity = 1;
            transitionStr = 'transform 0.25s cubic-bezier(0.3, 1.5, 0.5, 1), opacity 0.2s ease-out';
          }
          span.style.transform = `translateY(${translateY}px)`;
          span.style.opacity = opacity;
          span.style.transition = transitionStr;
        }
      }
    });

    if (selectedAnimation === 'slide') {
      const slideWrapper = overlayContainer.querySelector('.slide-wrapper');
      if (slideWrapper) {
        const activeDuration = time - segment.start;
        const progress = Math.min(1, Math.max(0, activeDuration / 0.35));
        const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
        const t = easeOutQuart(progress);
        const translateY = 100 * (1 - t);
        const opacity = progress === 0 ? 0 : 1;

        slideWrapper.style.transform = `translateY(${translateY}%)`;
        slideWrapper.style.opacity = opacity;
        slideWrapper.style.transition = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease-out';
      }
    }
  }
}

// ==================== Segment Cards Rendering & Event Handling ====================
function renderSegmentCards() {
  const container = document.getElementById('editor-segments');
  if (!container || !transcribeData) return;
  
  let html = '';
  transcribeData.segments.forEach((seg, idx) => {
    html += `
      <div id="segment-card-${idx}" class="segment-card">
        <div class="segment-card-header">
          <span class="segment-time-badge">⏱️ ${seg.start.toFixed(2)} - ${seg.end.toFixed(2)}</span>
          <button type="button" class="segment-play-btn" onclick="seekPlayer(${seg.start})">
            🎧 تشغيل هذه الجملة
          </button>
        </div>
        <textarea class="segment-textarea" oninput="handleSegmentChange(${idx}, this.value)">${seg.text}</textarea>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

window.seekPlayer = function(startTime) {
  const player = document.getElementById('media-player');
  if (player) {
    player.currentTime = startTime;
    player.play();
  }
};

window.handleSegmentChange = function(index, newText) {
  if (!transcribeData) return;
  
  const seg = transcribeData.segments[index];
  seg.text = newText;
  
  // Recalculate word-level timestamps (linear interpolation)
  const words = newText.split(/\s+/).filter(w => w.trim() !== "");
  const duration = seg.end - seg.start;
  seg.words = words.map((w, i) => {
    const start = seg.start + (i * duration) / Math.max(1, words.length);
    const end = seg.start + ((i + 1) * duration) / Math.max(1, words.length);
    return {
      word: w,
      start: parseFloat(start.toFixed(3)),
      end: parseFloat(end.toFixed(3))
    };
  });
  
  // Update the live caption overlay immediately if this is the active segment
  if (index === activeSegmentIndex) {
    updateLiveCaptionOverlay(currentTime);
  }
};

// ==================== Enter Key Split Handling ====================
function handleSegmentSplit(index, cursorPosition, fullText) {
  if (!transcribeData) return;
  
  const seg = transcribeData.segments[index];
  if (!seg.words || seg.words.length <= 1) return; // Cannot split if 0 or 1 word
  
  // 1. Determine how many words are before the cursor
  const textBefore = fullText.substring(0, cursorPosition);
  const wordsBefore = textBefore.trim().split(/\s+/).filter(w => w !== "");
  const splitIndex = wordsBefore.length;
  
  // Only split if we have a valid split point
  if (splitIndex <= 0 || splitIndex >= seg.words.length) return;
  
  // 2. Split the words array
  const wordsA = seg.words.slice(0, splitIndex);
  const wordsB = seg.words.slice(splitIndex);
  
  // 3. Create two new segments (retaining exact word timestamps)
  const segA = {
    start: seg.start,
    end: wordsA[wordsA.length - 1].end,
    text: wordsA.map(w => w.word).join(" "),
    words: wordsA
  };
  
  const segB = {
    start: wordsB[0].start,
    end: seg.end,
    text: wordsB.map(w => w.word).join(" "),
    words: wordsB
  };
  
  // 4. Replace the old segment with the two new segments
  transcribeData.segments.splice(index, 1, segA, segB);
  
  // 5. Re-render the segment cards
  renderSegmentCards();
  
  // 6. Focus the second segment's textarea at the beginning of the text
  setTimeout(() => {
    const nextTextarea = document.querySelector(`#segment-card-${index + 1} .segment-textarea`);
    if (nextTextarea) {
      nextTextarea.focus();
      nextTextarea.setSelectionRange(0, 0);
    }
  }, 50);
}

// Add event delegation for Enter key split on segment textareas
document.getElementById('editor-segments').addEventListener('keydown', function(e) {
  if (e.target.classList.contains('segment-textarea') && e.key === 'Enter') {
    e.preventDefault(); // Prevent inserting actual newline character
    
    const textarea = e.target;
    const card = textarea.closest('.segment-card');
    const index = parseInt(card.id.replace('segment-card-', ''));
    
    handleSegmentSplit(index, textarea.selectionStart, textarea.value);
  }
});

// ==================== Form submission & API handling ====================
formControls.addEventListener('submit', async function(e) {
  e.preventDefault();

  if (isSuspended) {
    document.getElementById('suspended-modal').style.display = 'flex';
    return;
  }

  // Check visitor limit before allowing submission
  if (!currentUser && freeOpsCount >= 2) {
    document.getElementById('login-prompt-modal').style.display = 'flex';
    return;
  }

  const youtubeUrlInput = document.getElementById('youtube-url-input');
  const youtubeUrl = youtubeUrlInput ? youtubeUrlInput.value.trim() : '';

  if (currentUploadSource === 'local' && !audioFile) {
    showState(errorState);
    errorMsg.textContent = 'يرجى اختيار ملف صوت أو فيديو أولاً لتوليد المقطع!';
    return;
  }
  if (currentUploadSource === 'youtube' && !youtubeUrl) {
    showState(errorState);
    errorMsg.textContent = 'يرجى إدخال رابط فيديو يوتيوب صالح!';
    return;
  }

  const originalSubmitText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.5';
  submitBtn.style.pointerEvents = 'none';
  submitBtn.innerHTML = '<span>⏳</span> جاري المعالجة...';

  showState(loadingState);
  
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressTextLabel = document.getElementById('progress-text-label');
  
  progressBarFill.style.width = '0%';
  progressTextLabel.textContent = 'جاري التحميل والمعالجة...';
  progressMsg.textContent = currentUploadSource === 'youtube' 
    ? 'جاري تنزيل صوت اليوتيوب بالخلفية بدقة عالية...'
    : 'جاري تهيئة الملف والرفع...';

  // Build FormData payload for transcribe
  const fd = new FormData();
  if (currentUploadSource === 'local') {
    fd.append('audio', audioFile);
  } else {
    fd.append('youtubeUrl', youtubeUrl);
  }
  if (leftLogoFile) fd.append('leftLogo', leftLogoFile);
  if (rightLogoFile) fd.append('rightLogo', rightLogoFile);
  fd.append('minWords', document.getElementById('min-words').value);
  fd.append('maxWords', document.getElementById('max-words').value);
  fd.append('animation', selectedAnimation);
  fd.append('activeColor', document.getElementById('active-color').value);
  fd.append('inactiveColor', document.getElementById('inactive-color').value);

  let intervalId = null;

  try {
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl + '/api/transcribe');

      xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          progressBarFill.style.width = percent + '%';
          progressTextLabel.textContent = `جاري الرفع: ${percent}%`;
          progressMsg.textContent = `جاري رفع الملف... ${percent}%`;
        }
      };

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('فشل قراءة استجابة السيرفر.'));
          }
        } else {
          let errorMsg = 'حدث خطأ في معالجة الملف في السيرفر';
          try {
            const errData = JSON.parse(xhr.responseText);
            errorMsg = errData.detail || errorMsg;
          } catch (_) {}
          reject(new Error(errorMsg));
        }
      };

      xhr.onerror = function() {
        reject(new Error('فشل الاتصال بالسيرفر. يرجى التحقق من تشغيل السيرفر أو الرابط.'));
      };

      // Send request
      xhr.send(fd);

      // Listen for when upload finishes to start the processing stage
      xhr.upload.onload = function() {
        progressBarFill.style.width = '5%';
        progressTextLabel.textContent = 'التقدم: 5%';
        progressMsg.textContent = 'تم الرفع بنجاح! جاري معالجة واستخراج الصوت...';
        
        let currentPercent = 5;
        intervalId = setInterval(() => {
          if (currentPercent < 95) {
            currentPercent += Math.floor(Math.random() * 4) + 1;
            if (currentPercent > 95) currentPercent = 95;
            
            progressBarFill.style.width = currentPercent + '%';
            progressTextLabel.textContent = `التقدم: ${currentPercent}%`;
            
            if (currentPercent > 30 && currentPercent <= 65) {
              progressMsg.textContent = 'جاري تنقيح وتحسين النص بالذكاء الاصطناعي...';
            } else if (currentPercent > 65) {
              progressMsg.textContent = 'جاري ترتيب التوقيت ومزامنة الكابشن مع الصوت...';
            }
          }
        }, 1500);
      };
    });

    if (intervalId) clearInterval(intervalId);
    progressBarFill.style.width = '100%';
    progressTextLabel.textContent = 'اكتمل!';

    transcribeData = data;
    
    // Hide main dashboard, show editor workspace
    document.getElementById('main-dashboard').classList.add('hidden');
    document.getElementById('editor-state').classList.remove('hidden');
    
    // Initialize editor view
    initMediaPlayer();
    renderSegmentCards();
    playSuccessSound();
    
    // Track upload event
    try {
      trackAction('upload');
      if (!currentUser) {
        freeOpsCount++;
        localStorage.setItem('free_ops_count', freeOpsCount);
        updateAuthWidget();
      }
    } catch (_) {}

    // Restore button state
    submitBtn.disabled = false;
    submitBtn.style.opacity = '';
    submitBtn.style.pointerEvents = '';
    submitBtn.innerHTML = originalSubmitText;

  } catch (err) {
    if (intervalId) clearInterval(intervalId);
    showState(errorState);
    errorMsg.textContent = err.message || 'فشل الاتصال بالسيرفر. يرجى التحقق من تشغيل السيرفر أو الرابط.';
    
    submitBtn.disabled = false;
    submitBtn.style.opacity = '';
    submitBtn.style.pointerEvents = '';
    submitBtn.innerHTML = originalSubmitText;
  }
});

// ==================== Render final video from edits ====================
window.renderVideo = async function() {
  if (!transcribeData) return;

  if (isSuspended) {
    document.getElementById('suspended-modal').style.display = 'flex';
    return;
  }

  // Check visitor limit before allowing rendering
  if (!currentUser && freeOpsCount >= 2) {
    document.getElementById('login-prompt-modal').style.display = 'flex';
    return;
  }
  
  const renderBtn = document.getElementById('render-btn');
  const originalRenderText = renderBtn ? renderBtn.innerHTML : '';
  if (renderBtn) {
    renderBtn.disabled = true;
    renderBtn.style.opacity = '0.5';
    renderBtn.style.pointerEvents = 'none';
    renderBtn.innerHTML = '<span>⏳</span> جاري رندرة وتوليد الفيديو...';
  }

  // Transition back to main dashboard loading state
  document.getElementById('editor-state').classList.add('hidden');
  const mainDashboard = document.getElementById('main-dashboard');
  mainDashboard.classList.remove('hidden');
  
  showState(loadingState);
  
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressTextLabel = document.getElementById('progress-text-label');
  
  progressBarFill.style.width = '5%';
  progressTextLabel.textContent = 'التقدم: 5%';
  progressMsg.textContent = 'جاري معالجة وتوليد مقطع الفيديو النهائي...';
  
  let currentPercent = 5;
  const renderIntervalId = setInterval(() => {
    if (currentPercent < 95) {
      currentPercent += Math.floor(Math.random() * 4) + 1;
      if (currentPercent > 95) currentPercent = 95;
      
      progressBarFill.style.width = currentPercent + '%';
      progressTextLabel.textContent = `التقدم: ${currentPercent}%`;
      
      if (currentPercent > 25 && currentPercent <= 55) {
        progressMsg.textContent = 'جاري رسم الإطارات والتقاط لقطات الفيديو مع الكابشن...';
      } else if (currentPercent > 55 && currentPercent <= 80) {
        progressMsg.textContent = 'جاري دمج ملف الصوت وضغط المقطع بصيغة MP4...';
      } else if (currentPercent > 80) {
        progressMsg.textContent = 'جاري تصدير المقطع النهائي وتجهيزه للتحميل...';
      }
    }
  }, 1500);
  
  const renderPayload = {
    audioPath: transcribeData.audioPath,
    videoPath: transcribeData.videoPath,
    durationInSeconds: transcribeData.durationInSeconds,
    segments: transcribeData.segments,
    animationType: selectedAnimation,
    activeColor: document.getElementById('active-color').value,
    inactiveColor: document.getElementById('inactive-color').value,
    leftLogo: transcribeData.leftLogo,
    rightLogo: transcribeData.rightLogo,
    fontSize: parseInt(document.getElementById('font-size').value) || 50,
    bgColor: document.getElementById('bg-color').value,
    bgOpacity: parseFloat(document.getElementById('bg-opacity').value) || 86,
    syncOffset: parseFloat(document.getElementById('sync-offset').value) || 0.20,
    wordSpacing: parseInt(document.getElementById('word-spacing').value) || 31,
    bgPadding: parseInt(document.getElementById('bg-padding').value) || 8,
    showBg: !document.getElementById('show-bg').checked,
    captionTop: captionTop
  };
  
  try {
    const res = await fetch(`${apiUrl}/api/render/${transcribeData.taskId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(renderPayload)
    });
    
    clearInterval(renderIntervalId);
    
    if (!res.ok) {
      let detail = 'حدث خطأ في معالجة الفيديو في السيرفر';
      try {
        const json = await res.json();
        detail = json.detail || detail;
      } catch(_) {}
      throw new Error(detail);
    }
    
    progressBarFill.style.width = '98%';
    progressTextLabel.textContent = 'جاري تنزيل الفيديو المكتمل...';
    progressMsg.textContent = 'جاري تنزيل الفيديو المكتمل...';
    
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    progressBarFill.style.width = '100%';
    progressTextLabel.textContent = 'اكتمل!';
    
    outputVideo.src = url;
    downloadLink.href = url;
    showState(successState);
    playSuccessSound();

    // Track render event
    try {
      trackAction('render');
      if (currentUser && window.firebaseDb) {
        const userRef = window.firebaseDb.collection('users').doc(currentUser.uid);
        await userRef.update({
          renders_count: firebase.firestore.FieldValue.increment(1)
        }).catch(e => console.warn(e));
      } else if (!currentUser) {
        freeOpsCount++;
        localStorage.setItem('free_ops_count', freeOpsCount);
        updateAuthWidget();
      }
    } catch (_) {}

    if (renderBtn) {
      renderBtn.disabled = false;
      renderBtn.style.opacity = '';
      renderBtn.style.pointerEvents = '';
      renderBtn.innerHTML = originalRenderText;
    }
    
  } catch (err) {
    clearInterval(renderIntervalId);
    showState(errorState);
    errorMsg.textContent = err.message || 'فشل رندرة الفيديو. يرجى المحاولة مرة أخرى.';

    if (renderBtn) {
      renderBtn.disabled = false;
      renderBtn.style.opacity = '';
      renderBtn.style.pointerEvents = '';
      renderBtn.innerHTML = originalRenderText;
    }
  }
};

window.downloadSRT = function() {
  if (!transcribeData || !transcribeData.segments) return;
  
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }
  
  let srtContent = '';
  transcribeData.segments.forEach((seg, idx) => {
    const startStr = formatTime(seg.start);
    const endStr = formatTime(seg.end);
    srtContent += `${idx + 1}\n${startStr} --> ${endStr}\n${seg.text}\n\n`;
  });
  
  const blob = new Blob([srtContent.trim()], { type: 'text/srt;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'rekaption_subtitles.srt');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ==================== User Auth & Visitor Limits ====================
let currentUser = null;
let freeOpsCount = parseInt(localStorage.getItem('free_ops_count') || '0', 10);

function updateAuthWidget() {
  const widget = document.getElementById('user-auth-widget');
  if (!widget) return;

  if (currentUser) {
    widget.innerHTML = `
      ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" alt="profile" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--purple-accent);" />` : ''}
      <div style="text-align: right;">
        <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${currentUser.displayName || currentUser.email}</div>
        <div style="font-size: 10px; color: var(--text-muted);">حساب مفعل ⚡</div>
      </div>
      <button 
        type="button" 
        onclick="triggerSignOut()"
        style="margin: 0; padding: 6px 12px; font-size: 12px; border-radius: 20px; border: 1px solid #ef4444; color: #ef4444; background: rgba(239,68,68,0.05); cursor: pointer; transition: all 0.2s;"
      >
        تسجيل الخروج 🚪
      </button>
    `;
  } else {
    const remaining = Math.max(0, 2 - freeOpsCount);
    widget.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); display: flex; flex-direction: column; align-items: flex-start;">
        <span style="font-weight: 600;">الوضع المجاني (زائر)</span>
        <span style="font-size: 10px;">العمليات المتبقية: ${remaining}/2</span>
      </div>
      <button 
        type="button" 
        onclick="triggerGoogleLogin()" 
        style="margin: 0; padding: 8px 16px; font-size: 13px; border-radius: 20px; color: #fff; background: linear-gradient(135deg, #4285F4, #34A853); border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 600;"
      >
        <span>🌐</span> الدخول بجوجل
      </button>
    `;
  }
}

window.triggerGoogleLogin = async function() {
  try {
    const user = await window.signInWithGoogle();
    currentUser = user;
    document.getElementById('login-prompt-modal').style.display = 'none';
    
    // Sync with Firestore
    const data = await syncUserWithFirestore(user);
    if (data) {
      if (data.is_active === false) {
        isSuspended = true;
        document.getElementById('suspended-modal').style.display = 'flex';
        return;
      } else {
        isSuspended = false;
      }
      if (!data.whatsapp) {
        document.getElementById('whatsapp-modal').style.display = 'flex';
        document.getElementById('whatsapp-error').style.display = 'none';
      }
    }
    updateAuthWidget();
  } catch (err) {
    console.error(err);
    alert(err.message || 'فشل تسجيل الدخول بحساب جوجل.');
  }
};

window.triggerSignOut = async function() {
  try {
    await window.signOutUser();
    currentUser = null;
    isSuspended = false;
    updateAuthWidget();
  } catch (err) {
    console.error(err);
  }
};

window.handleSaveWhatsapp = async function(e) {
  e.preventDefault();
  const input = document.getElementById('whatsapp-input');
  const errorDiv = document.getElementById('whatsapp-error');
  const num = input.value.trim();
  if (!num) {
    errorDiv.textContent = 'يرجى إدخال رقم واتساب صالح';
    errorDiv.style.display = 'block';
    return;
  }
  errorDiv.style.display = 'none';
  
  const submitBtn = document.getElementById('whatsapp-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري الحفظ...';
  
  try {
    if (!window.firebaseDb) {
      throw new Error("قاعدة بيانات فايربيز غير جاهزة بعد");
    }
    await window.firebaseDb.collection('users').doc(currentUser.uid).update({
      whatsapp: num
    });
    document.getElementById('whatsapp-modal').style.display = 'none';
    input.value = '';
  } catch (err) {
    errorDiv.textContent = err.message || 'فشل حفظ رقم الواتساب في فايربيز.';
    errorDiv.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'حفظ ومتابعة 🚀';
  }
};

// Initialize Auth State Listener
setTimeout(() => {
  if (window.onAuthStateChanged) {
    window.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        // Verify or register in Firestore
        try {
          const data = await syncUserWithFirestore(user);
          if (data) {
            if (data.is_active === false) {
              isSuspended = true;
              document.getElementById('suspended-modal').style.display = 'flex';
              return;
            } else {
              isSuspended = false;
            }
            if (!data.whatsapp) {
              document.getElementById('whatsapp-modal').style.display = 'flex';
              document.getElementById('whatsapp-error').style.display = 'none';
            }
          }
        } catch (err) {
          console.warn('Firestore user sync failed:', err);
        }
      } else {
        currentUser = null;
        isSuspended = false;
      }
      updateAuthWidget();
    });
  } else {
    updateAuthWidget();
  }
}, 500);

// ==================== Gemini Transcribe Logic ====================
window.switchMainTab = function(tab) {
  const editorBtn = document.getElementById('main-nav-editor');
  const geminiBtn = document.getElementById('main-nav-gemini');
  const dashboard = document.getElementById('main-dashboard');
  const geminiPanel = document.getElementById('gemini-transcribe-panel');
  const editorState = document.getElementById('editor-state');

  if (tab === 'editor') {
    editorBtn.classList.add('active');
    editorBtn.style.background = 'rgba(139, 92, 246, 0.15)';
    editorBtn.style.borderColor = 'var(--purple-accent)';
    editorBtn.style.color = '#fff';

    geminiBtn.classList.remove('active');
    geminiBtn.style.background = 'transparent';
    geminiBtn.style.borderColor = 'transparent';
    geminiBtn.style.color = 'rgba(255,255,255,0.6)';

    dashboard.classList.remove('hidden');
    geminiPanel.classList.add('hidden');
  } else {
    geminiBtn.classList.add('active');
    geminiBtn.style.background = 'rgba(139, 92, 246, 0.15)';
    geminiBtn.style.borderColor = 'var(--purple-accent)';
    geminiBtn.style.color = '#fff';

    editorBtn.classList.remove('active');
    editorBtn.style.background = 'transparent';
    editorBtn.style.borderColor = 'transparent';
    editorBtn.style.color = 'rgba(255,255,255,0.6)';

    dashboard.classList.add('hidden');
    editorState.classList.add('hidden'); // hide editor if open
    geminiPanel.classList.remove('hidden');

    // Load Gemini API Key from localStorage
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      document.getElementById('gemini-key-input').value = savedKey;
    }
  }
};

window.startAudioDownloadOnly = async function() {
  const urlInput = document.getElementById('gemini-yt-url');
  const keyInput = document.getElementById('gemini-key-input');
  const startBtn = document.getElementById('gemini-start-btn');
  const loadingDiv = document.getElementById('gemini-loading');
  const statusText = document.getElementById('gemini-status-text');
  const progressBarFill = document.getElementById('gemini-progress-bar-fill');
  const progressText = document.getElementById('gemini-progress-text');
  
  const placeholderText = document.getElementById('audio-placeholder-text');
  const audioPlayer = document.getElementById('downloaded-audio-player');
  const audioLink = document.getElementById('downloaded-audio-link');

  const transcriptionContainer = document.getElementById('transcription-container');
  const transcriptionText = document.getElementById('transcription-text');
  const txtLink = document.getElementById('downloaded-txt-link');

  const youtubeUrl = urlInput.value.trim();
  const geminiApiKey = keyInput ? keyInput.value.trim() : '';

  if (!youtubeUrl) {
    alert('الرجاء إدخال رابط فيديو يوتيوب صالح!');
    return;
  }

  // Save key if provided
  if (geminiApiKey) {
    localStorage.setItem('gemini_api_key', geminiApiKey);
  }

  // Disable UI
  startBtn.disabled = true;
  startBtn.style.opacity = '0.5';
  loadingDiv.classList.remove('hidden');
  
  // Hide previous player/link/transcription if any
  audioPlayer.style.display = 'none';
  audioPlayer.src = '';
  audioLink.style.display = 'none';
  if (transcriptionContainer) transcriptionContainer.style.display = 'none';
  placeholderText.style.display = 'block';
  placeholderText.textContent = 'جاري التحميل ومعالجة الصوت والذكاء الاصطناعي...';

  // Reset Progress Bar
  progressBarFill.style.width = '0%';
  progressText.textContent = 'الخطوة 1 / 2: جاري التحميل ومعالجة الصوت...';

  // Start simulated progress
  let currentProgress = 5;
  progressBarFill.style.width = currentProgress + '%';

  const updateProgress = (target, speed, message, stepLabel) => {
    return setInterval(() => {
      if (currentProgress < target) {
        currentProgress += 1;
        progressBarFill.style.width = currentProgress + '%';
        progressText.textContent = `${stepLabel} (${currentProgress}%)`;
        statusText.textContent = message;
      }
    }, speed);
  };

  // Phase 1: Downloading & Transcription (from 5% to 90%)
  const hasKey = geminiApiKey && geminiApiKey.toLowerCase() !== 'none';
  const processMsg = hasKey ? 'جاري تحميل الصوت وتقسيمه وتفريغه بالذكاء الاصطناعي (قد يستغرق ذلك دقيقة أو دقيقتين)...' : 'جاري تحميل الصوت من يوتيوب وتحويله لصيغة MP3...';
  let progressInterval = updateProgress(
    92, 
    800, 
    processMsg,
    'جاري المعالجة والتحويل'
  );

  try {
    const response = await fetch(audioApiUrl + '/api/transcribe-gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        youtubeUrl: youtubeUrl,
        geminiApiKey: geminiApiKey || "none"
      })
    });

    clearInterval(progressInterval);

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || 'فشلت معالجة الطلب على السيرفر.');
    }

    const resData = await response.json();
    
    // Complete
    currentProgress = 100;
    progressBarFill.style.width = '100%';
    progressText.textContent = 'الخطوة 2 / 2: اكتمل المعالجة!';
    statusText.textContent = '✅ تمت العملية بنجاح!';
    
    // Display player
    const fullAudioUrl = resData.audioUrl.startsWith('http') ? resData.audioUrl : (audioApiUrl + '/' + resData.audioUrl);
    audioPlayer.src = fullAudioUrl;
    audioPlayer.style.display = 'block';
    audioLink.href = fullAudioUrl;
    audioLink.style.display = 'flex';
    placeholderText.style.display = 'none';

    // Display transcription if available
    if (resData.transcription && transcriptionContainer && transcriptionText && txtLink) {
      transcriptionText.value = resData.transcription;
      transcriptionContainer.style.display = 'flex';
      const fullTxtUrl = resData.transcriptionUrl.startsWith('http') ? resData.transcriptionUrl : (audioApiUrl + '/' + resData.transcriptionUrl);
      txtLink.href = fullTxtUrl;
    }
  } catch (err) {
    clearInterval(progressInterval);
    progressBarFill.style.width = '0%';
    progressText.textContent = '❌ فشلت العملية.';
    alert('حدث خطأ أثناء المعالجة: ' + err.message);
    statusText.textContent = '❌ فشلت العملية.';
    placeholderText.textContent = 'فشلت العملية. يرجى التحقق من الرابط ومفتاح الـ API والمحاولة مجدداً.';
  } finally {
    startBtn.disabled = false;
    startBtn.style.opacity = '1';
  }
};

