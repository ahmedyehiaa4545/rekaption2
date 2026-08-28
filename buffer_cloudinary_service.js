/**
 * ReKaption - Buffer & Cloudinary Integration Service
 * Ultra-Clean TikTok Publishing, Scheduling & AI 2-Sentence Smart Captioning.
 */

(function() {
  const SETTINGS_KEY = 'rekaption_buffer_cloudinary_settings';
  const PUBLISH_HISTORY_KEY = 'rekaption_tiktok_publish_history';

  let currentTabSelectedVideo = null;

  // 1. Settings & Storage
  function getStoredSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : {
        cloudName: '',
        uploadPreset: '',
        bufferToken: '',
        defaultChannelId: '',
        defaultHashtags: '#fyp #viral #shorts #rekaption #تيك_توك'
      };
    } catch(e) {
      return {
        cloudName: '',
        uploadPreset: '',
        bufferToken: '',
        defaultChannelId: '',
        defaultHashtags: '#fyp #viral #shorts #rekaption #تيك_توك'
      };
    }
  }

  function saveStoredSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function getPublishHistory() {
    try {
      const data = localStorage.getItem(PUBLISH_HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch(e) {
      return [];
    }
  }

  function addPublishHistoryEntry(entry) {
    try {
      const history = getPublishHistory();
      history.unshift({
        id: 'pub_' + Date.now(),
        title: entry.title || 'منشور تيك توك',
        cleanTitle: entry.cleanTitle || '',
        videoUrl: entry.videoUrl || '',
        cloudinaryUrl: entry.cloudinaryUrl || '',
        scheduledAt: entry.scheduledAt || null,
        isNow: entry.isNow,
        timestamp: Date.now(),
        channelName: entry.channelName || 'TikTok'
      });
      if (history.length > 20) history.pop();
      localStorage.setItem(PUBLISH_HISTORY_KEY, JSON.stringify(history));
    } catch(e) {
      console.warn('Failed to save publish history:', e);
    }
  }

  // 2. Clean Text & Clean Title Helpers
  function cleanTikTokTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    return rawTitle
      .replace(/^[\s🎬🎥✨📱]*(?:مقطع(?:\s*مقترح|\s*Shorts)?|Shorts)\s*#?\d*[:\s\-]*/gi, '')
      .replace(/\s*\(\d+:\d+\s*-\s*\d+:\d+\)/g, '')
      .replace(/^[🎬🎥✨📱\s\-_:]+/, '')
      .trim();
  }

  function stripTimestampsAndNoise(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      .replace(/\[\s*\d+:\d+\s*->\s*\d+:\d+\s*\]/g, '') // remove [04:08 -> 04:10]
      .replace(/\(\s*\d+:\d+\s*-\s*\d+:\d+\s*\)/g, '')
      .replace(/\d+:\d+:\d+|\d+:\d+/g, '')
      .replace(/[\u064B-\u065F]/g, '') // remove harakat
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function fetchYoutubeOEmbedTitle(url) {
    if (!url || typeof url !== 'string' || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return '';
    }
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        return data.title || '';
      }
    } catch(e) {
      console.warn('oEmbed title fetch failed:', e);
    }
    return '';
  }

  // 3. Smart 2-Sentence AI Caption Builder
  async function generateSmartTikTokCaption({ cleanTitle, originalYoutubeTitle, scriptText, geminiApiKey, defaultHashtags }) {
    const title = cleanTitle || 'مقطع مميز';
    const ytTitle = originalYoutubeTitle || window.currentYoutubeTitle || 'فيديو يوتيوب';
    const hashtags = defaultHashtags || '#fyp #viral #shorts #rekaption #تيك_توك';

    let summaryTwoSentences = '';
    const cleanRawScript = stripTimestampsAndNoise(scriptText || '');

    // 1. Try Gemini AI generation if key is provided
    const apiKey = geminiApiKey || localStorage.getItem('gemini_api_key') || '';
    if (apiKey && cleanRawScript && cleanRawScript.length > 30) {
      try {
        const prompt = `أنت كاتب محتوى لمنصة TikTok.
اكتب ملخصاً مشوقاً ودقيقاً لغوياً من جملتين اثنتين فقط باللغة العربية الفصحى (بحد أقصى 35 كلمة) عن هذا المقطع:
العنوان: "${title}"
سياق المقطع: "${cleanRawScript.substring(0, 1000)}"

الشروط الصارمة:
- جملتان اثنتان فقط لا غير.
- أسلوب مشوق وجذاب للمشاهد.
- بدون أي مقدمات (لا تكتب "إليك الملخص" أو ما شابه).
- بدون هاشتاجات وبدون تكرار العنوان.`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 120 }
          })
        });

        if (res.ok) {
          const data = await res.json();
          const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (generatedText) {
            summaryTwoSentences = generatedText;
          }
        }
      } catch (err) {
        console.warn('Gemini caption generation fallback:', err);
      }
    }

    // 2. High quality fallback if AI is not configured or failed
    if (!summaryTwoSentences) {
      if (cleanRawScript && cleanRawScript.length > 20) {
        const sentences = cleanRawScript.split(/[\.\n\?!،]+/).map(s => s.trim()).filter(s => s.length > 15);
        if (sentences.length >= 2) {
          summaryTwoSentences = `${sentences[0]}. ${sentences[1]}.`;
        } else if (sentences.length === 1) {
          summaryTwoSentences = `${sentences[0]}. تابع الفيديو لمعرفة باقي التفاصيل الممتعة!`;
        }
      }
    }

    if (!summaryTwoSentences || summaryTwoSentences.length > 250) {
      summaryTwoSentences = `نظرة سريعة ومشوقة تكشف أهم التفاصيل والكواليس غير المتوقعة حول ${title}. تابع المقطع للنهاية لمعرفة القصة كاملة!`;
    }

    // Final clean, beautiful formatting (NEVER dumps raw transcription)
    return `${title}\n\n${summaryTwoSentences}\n\nجزء من حلقة: ${ytTitle}\n\n${hashtags}`;
  }

  // 4. Cloudinary Upload Engine
  async function uploadToCloudinary(fileOrBlobOrUrl, cloudName, uploadPreset, onProgress) {
    if (!cloudName || !uploadPreset) {
      throw new Error('يرجى إدخال Cloud Name و Upload Preset لحساب Cloudinary في الإعدادات.');
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName.trim()}/video/upload`;
    const formData = new FormData();
    formData.append('upload_preset', uploadPreset.trim());

    if (fileOrBlobOrUrl instanceof Blob || fileOrBlobOrUrl instanceof File) {
      formData.append('file', fileOrBlobOrUrl, 'rekaption_tiktok.mp4');
    } else if (typeof fileOrBlobOrUrl === 'string' && fileOrBlobOrUrl.startsWith('http')) {
      formData.append('file', fileOrBlobOrUrl);
    } else {
      throw new Error('صيغة الفيديو غير صالحة للرفع إلى Cloudinary.');
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            if (resp.secure_url) {
              resolve(resp.secure_url);
            } else {
              reject(new Error(resp.error ? resp.error.message : 'فشل الحصول على رابط الفيديو من Cloudinary'));
            }
          } catch(e) {
            reject(new Error('خطأ في استجابة Cloudinary: ' + e.message));
          }
        } else {
          try {
            const errResp = JSON.parse(xhr.responseText);
            reject(new Error(errResp.error ? errResp.error.message : `خطأ Cloudinary (كود ${xhr.status})`));
          } catch(_) {
            reject(new Error(`خطأ في رفع الفيديو إلى Cloudinary (كود ${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => {
        reject(new Error('فشل الاتصال بخدمة Cloudinary. تأكد من صحة الـ Cloud Name والـ Preset.'));
      };

      xhr.send(formData);
    });
  }

  // 5. Buffer Channel & Publish Engine (With Multi-Tier Proxy & Direct Fallback)
  async function fetchBufferChannels(bufferToken) {
    if (!bufferToken) {
      throw new Error('يرجى إدخال مفتاح Buffer API Token في الإعدادات.');
    }

    const endpointsToTry = [
      '/api/buffer/channels', // Current server proxy
      `${(window.apiUrl || '').replace(/\/$/, '')}/api/buffer/channels` // Remote API proxy if configured
    ];

    for (const ep of endpointsToTry) {
      if (!ep || ep === '/api/buffer/channels' && window.location.protocol === 'file:') continue;
      try {
        const proxyRes = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: bufferToken.trim() })
        });
        if (proxyRes.ok) {
          const data = await proxyRes.json();
          if (data && data.channels && data.channels.length > 0) {
            return data.channels;
          }
          if (data && data.error) {
            console.warn(`Buffer Proxy error on ${ep}:`, data.error);
          }
        }
      } catch (err) {
        console.warn(`Proxy attempt failed on ${ep}:`, err);
      }
    }

    // Direct Browser GraphQL Fallback (2-step query: Organizations -> Channels)
    try {
      const orgQuery = `query { account { id organizations { id name } } }`;
      const orgRes = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bufferToken.trim()}`
        },
        body: JSON.stringify({ query: orgQuery })
      });

      if (orgRes.ok) {
        const orgData = await orgRes.json();
        const orgs = orgData?.data?.account?.organizations || [];
        const allChannels = [];

        const chanQuery = `query GetChannels($input: ChannelsInput!) { channels(input: $input) { id name displayName service avatar } }`;
        for (const org of orgs) {
          if (!org.id) continue;
          const cRes = await fetch('https://api.buffer.com', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${bufferToken.trim()}`
            },
            body: JSON.stringify({ query: chanQuery, variables: { input: { organizationId: org.id } } })
          });
          if (cRes.ok) {
            const cData = await cRes.json();
            const chList = cData?.data?.channels || [];
            chList.forEach(ch => {
              allChannels.push({
                id: ch.id,
                name: ch.name || ch.displayName || 'TikTok Channel',
                displayName: ch.displayName || ch.name,
                service: ch.service || 'tiktok',
                avatar: ch.avatar || '',
                organizationName: org.name
              });
            });
          }
        }
        if (allChannels.length > 0) return allChannels;
      }
    } catch(directErr) {
      console.warn('Direct GraphQL fetch failed:', directErr);
    }

    throw new Error('تعذر جلب قنوات Buffer. يرجى التحقق من صحة مفتاح الـ API والتأكد من ربط حساب TikTok في Buffer.');
  }

  async function publishToBuffer({ bufferToken, channelId, text, videoUrl, scheduledAt, isNow }) {
    if (!bufferToken) throw new Error('مفتاح Buffer API غير موجود.');
    if (!channelId) throw new Error('يرجى اختيار حساب TikTok.');
    if (!videoUrl) throw new Error('رابط الفيديو مفقود.');

    const endpointsToTry = [
      '/api/buffer/publish',
      `${(window.apiUrl || '').replace(/\/$/, '')}/api/buffer/publish`
    ];

    const payload = {
      token: bufferToken.trim(),
      channel_id: channelId.trim(),
      text: text || '',
      video_url: videoUrl,
      scheduled_at: scheduledAt || null,
      is_now: !!isNow
    };

    for (const ep of endpointsToTry) {
      if (!ep || ep === '/api/buffer/publish' && window.location.protocol === 'file:') continue;
      try {
        const proxyRes = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (proxyRes.ok) {
          const resJson = await proxyRes.json();
          if (resJson.status === 'success') return resJson;
          if (resJson.error) throw new Error(resJson.error);
        }
      } catch (proxyErr) {
        console.warn(`Proxy publish attempt failed on ${ep}:`, proxyErr);
      }
    }

    // Direct Browser Mutation Fallback
    const mutation = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post {
              id
              dueAt
              status
              text
            }
          }
          ... on MutationError {
            message
          }
        }
      }
    `;

    const input = {
      channelId: channelId.trim(),
      text: text || '',
      schedulingType: 'automatic',
      mode: isNow ? 'shareNow' : 'customScheduled',
      assets: [
        {
          video: {
            url: videoUrl
          }
        }
      ]
    };

    if (!isNow && scheduledAt) {
      input.dueAt = new Date(scheduledAt).toISOString();
    }

    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bufferToken.trim()}`
      },
      body: JSON.stringify({ query: mutation, variables: { input } })
    });

    if (!res.ok) {
      throw new Error(`خطأ في استجابة Buffer API (كود ${res.status})`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'فشل إرسال المنشور إلى Buffer');
    }

    const result = json.data?.createPost;
    if (result?.message) throw new Error(result.message);
    return result?.post || { id: 'success', status: isNow ? 'published' : 'scheduled' };
  }

  // 6. Simplified UI Controller
  window.initTikTokDashboardTab = async function() {
    const settings = getStoredSettings();
    const cName = document.getElementById('tab-setting-cloud-name');
    const cPreset = document.getElementById('tab-setting-upload-preset');
    const bToken = document.getElementById('tab-setting-buffer-token');
    const bTags = document.getElementById('tab-setting-default-hashtags');

    if (cName) cName.value = settings.cloudName || '';
    if (cPreset) cPreset.value = settings.uploadPreset || '';
    if (bToken) bToken.value = settings.bufferToken || '';
    if (bTags) bTags.value = settings.defaultHashtags || '#fyp #viral #shorts #rekaption #تيك_توك';

    // Set default schedule time (1 hour later)
    const schedInput = document.getElementById('tab-buffer-schedule-time');
    if (schedInput && !schedInput.value) {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
      const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      schedInput.value = localIso;
      schedInput.min = new Date(Date.now() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    }

    // Refresh channels
    await refreshTikTokTabChannels();

    // Render Archive video picker
    await renderTikTokTabArchivePicker();

    // Render history
    renderTikTokTabPublishHistory();

    // If no video is selected yet, try to auto-select
    if (!currentTabSelectedVideo) {
      if (window.lastRenderedVideoBlob || window.lastRenderedVideoUrl) {
        selectVideoForTikTokDashboard({
          blob: window.lastRenderedVideoBlob,
          url: window.lastRenderedVideoUrl,
          title: document.getElementById('title-text-input')?.value || 'فيديو كابشن حديث',
          type: 'active'
        });
      }
    }
  };

  async function refreshTikTokTabChannels() {
    const settings = getStoredSettings();
    const select = document.getElementById('tab-buffer-channel-select');
    const refreshBtn = document.getElementById('tab-buffer-refresh-channels-btn');
    if (!select) return;

    if (!settings.bufferToken) {
      select.innerHTML = '<option value="">⚠️ يرجى إدخال مفتاح Buffer API في الإعدادات أدناه</option>';
      return;
    }

    select.innerHTML = '<option value="">⏳ جاري الاتصال بـ Buffer وجلب القنوات...</option>';
    if (refreshBtn) refreshBtn.classList.add('spinning');

    try {
      const channels = await fetchBufferChannels(settings.bufferToken);
      if (!channels || channels.length === 0) {
        select.innerHTML = '<option value="">❌ لم يتم العثور على قنوات متصلة في حسابك</option>';
        return;
      }

      select.innerHTML = '';
      let hasTikTok = false;

      channels.forEach(ch => {
        const isTikTok = (ch.service || '').toLowerCase().includes('tiktok');
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = `${isTikTok ? '🎵 [TikTok]' : `[${ch.service}]`} ${ch.name || ch.displayName}`;
        if (isTikTok && !hasTikTok) {
          opt.selected = true;
          hasTikTok = true;
        }
        select.appendChild(opt);
      });

      if (!hasTikTok && channels.length > 0) {
        select.selectedIndex = 0;
      }
    } catch(err) {
      console.error('Error fetching Buffer channels:', err);
      select.innerHTML = `<option value="">⚠️ خطأ: ${err.message || 'فشل جلب القنوات'}</option>`;
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }
  window.refreshTikTokTabChannels = refreshTikTokTabChannels;

  async function renderTikTokTabArchivePicker() {
    const container = document.getElementById('tab-archive-picker-grid');
    const emptyMsg = document.getElementById('tab-archive-picker-empty');
    if (!container) return;

    let entries = [];
    if (typeof getHistoryEntries === 'function') entries = getHistoryEntries();

    if (!entries || entries.length === 0) {
      container.innerHTML = '';
      if (emptyMsg) emptyMsg.style.display = 'block';
      return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';

    container.innerHTML = entries.map(item => {
      const clean = cleanTikTokTitle(item.title);
      return `
        <div id="picker-card-${item.id}" onclick="selectVideoFromArchiveCard('${item.id}')" style="background: rgba(255, 255, 255, 0.03); border: 1.5px solid rgba(139, 92, 246, 0.25); border-radius: 12px; padding: 10px 14px; cursor: pointer; transition: all 0.2s ease; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
          <div style="font-size: 13px; font-weight: 700; color: #fff; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            🎬 ${clean}
          </div>
          <span style="background: rgba(139, 92, 246, 0.2); padding: 3px 8px; border-radius: 6px; color: #c084fc; font-size: 11px; font-weight: 700; flex-shrink: 0;">اختر ➔</span>
        </div>
      `;
    }).join('');

    if (currentTabSelectedVideo && currentTabSelectedVideo.id) {
      const el = document.getElementById(`picker-card-${currentTabSelectedVideo.id}`);
      if (el) {
        el.style.borderColor = '#ec4899';
        el.style.background = 'rgba(236, 72, 153, 0.12)';
      }
    }
  }

  window.selectVideoFromArchiveCard = async function(id) {
    let entries = [];
    if (typeof getHistoryEntries === 'function') entries = getHistoryEntries();
    const item = entries.find(e => e.id === id);
    if (!item) return;

    let blob = null;
    if (typeof getVideoBlobFromIDB === 'function') {
      blob = await getVideoBlobFromIDB(item.id);
    }

    let activeUrl = '';
    if (blob && blob.size > 0) {
      activeUrl = URL.createObjectURL(blob);
    } else if (item.serverUrl) {
      activeUrl = item.serverUrl;
      if (!activeUrl.startsWith('http') && typeof apiUrl !== 'undefined') {
        activeUrl = `${apiUrl.replace(/\/$/, '')}/${activeUrl.replace(/^\//, '')}`;
      }
    } else if (item.videoUrl) {
      activeUrl = item.videoUrl;
    }

    let ytTitle = item.originalYoutubeTitle || window.currentYoutubeTitle || '';
    if (!ytTitle && document.getElementById('gemini-yt-url')) {
      const curYtUrl = document.getElementById('gemini-yt-url').value.trim();
      if (curYtUrl) ytTitle = await fetchYoutubeOEmbedTitle(curYtUrl);
    }

    selectVideoForTikTokDashboard({
      id: item.id,
      blob: blob,
      url: activeUrl,
      title: item.title,
      cleanTitle: cleanTikTokTitle(item.title),
      youtubeTitle: ytTitle,
      script: item.script || ''
    });

    document.querySelectorAll('[id^="picker-card-"]').forEach(c => {
      c.style.borderColor = 'rgba(139, 92, 246, 0.25)';
      c.style.background = 'rgba(255, 255, 255, 0.03)';
    });
    const currentCard = document.getElementById(`picker-card-${id}`);
    if (currentCard) {
      currentCard.style.borderColor = '#ec4899';
      currentCard.style.background = 'rgba(236, 72, 153, 0.12)';
    }
  };

  function selectVideoForTikTokDashboard(payload) {
    const clean = payload.cleanTitle || cleanTikTokTitle(payload.title) || 'فيديو شورتس مميز';
    currentTabSelectedVideo = {
      id: payload.id || null,
      blob: payload.blob || null,
      url: payload.url || '',
      title: payload.title || clean,
      cleanTitle: clean,
      youtubeTitle: payload.youtubeTitle || window.currentYoutubeTitle || '',
      script: payload.script || ''
    };

    const player = document.getElementById('tab-tiktok-video-preview');
    const playerCard = document.getElementById('tab-selected-video-card');

    if (player && payload.url) {
      player.src = payload.url;
      if (playerCard) playerCard.style.display = 'block';
    }

    const titleInput = document.getElementById('tab-clean-title-input');
    if (titleInput) titleInput.value = clean;

    const ytInput = document.getElementById('tab-youtube-title-input');
    if (ytInput) ytInput.value = currentTabSelectedVideo.youtubeTitle || '';

    autoDraftTikTokCaption();
  }

  window.handleCustomVideoFileUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    selectVideoForTikTokDashboard({
      blob: file,
      url: url,
      title: fileName,
      cleanTitle: cleanTikTokTitle(fileName),
      youtubeTitle: window.currentYoutubeTitle || ''
    });
  };

  async function autoDraftTikTokCaption() {
    if (!currentTabSelectedVideo) return;

    const settings = getStoredSettings();
    const cleanTitle = document.getElementById('tab-clean-title-input')?.value.trim() || currentTabSelectedVideo.cleanTitle;
    const ytTitle = document.getElementById('tab-youtube-title-input')?.value.trim() || currentTabSelectedVideo.youtubeTitle || window.currentYoutubeTitle || '';
    const geminiKey = localStorage.getItem('gemini_api_key') || document.getElementById('gemini-key-input')?.value.trim() || '';

    const caption = await generateSmartTikTokCaption({
      cleanTitle: cleanTitle,
      originalYoutubeTitle: ytTitle,
      scriptText: currentTabSelectedVideo.script || '',
      geminiApiKey: geminiKey,
      defaultHashtags: settings.defaultHashtags
    });

    const captionArea = document.getElementById('tab-buffer-caption-text');
    if (captionArea) {
      captionArea.value = caption;
      updateTabCharCount();
    }
  }
  window.autoDraftTikTokCaption = autoDraftTikTokCaption;

  window.generateAICaptionInTab = async function() {
    const btn = document.getElementById('tab-ai-caption-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> جاري صياغة ملخص ذكي...';
    }
    try {
      await autoDraftTikTokCaption();
      showToastNotification('✨ تم توليد وتنسيق الكابشن الذكي بنجاح');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>✨</span> توليد كابشن ذكي (ملخص من جملتين)';
      }
    }
  };

  window.fetchAndSetYoutubeTitleInTab = async function() {
    const btn = document.getElementById('tab-fetch-yt-title-btn');
    const ytInput = document.getElementById('gemini-yt-url');
    const url = ytInput ? ytInput.value.trim() : '';

    if (!url) {
      const manualUrl = prompt('أدخل رابط فيديو اليوتيوب لجلب عنوان الحلقة الأصلية:');
      if (manualUrl) {
        if (btn) btn.textContent = '⏳ جاري الفحص...';
        const t = await fetchYoutubeOEmbedTitle(manualUrl);
        if (t) {
          window.currentYoutubeTitle = t;
          const targetInput = document.getElementById('tab-youtube-title-input');
          if (targetInput) targetInput.value = t;
          autoDraftTikTokCaption();
          showToastNotification('✅ تم جلب عنوان حلقة اليوتيوب بنجاح');
        } else {
          alert('تعذر جلب العنوان تلقائياً. يمكنك كتابته يدوياً.');
        }
        if (btn) btn.textContent = '🔍 جلب من يوتيوب';
      }
      return;
    }

    if (btn) btn.textContent = '⏳ جاري الفحص...';
    const t = await fetchYoutubeOEmbedTitle(url);
    if (t) {
      window.currentYoutubeTitle = t;
      const targetInput = document.getElementById('tab-youtube-title-input');
      if (targetInput) targetInput.value = t;
      autoDraftTikTokCaption();
      showToastNotification('✅ تم جلب عنوان حلقة اليوتيوب بنجاح');
    } else {
      alert('تعذر جلب العنوان من هذا الرابط. يمكنك كتابته يدوياً.');
    }
    if (btn) btn.textContent = '🔍 جلب من يوتيوب';
  };

  function updateTabCharCount() {
    const input = document.getElementById('tab-buffer-caption-text');
    const countEl = document.getElementById('tab-buffer-char-count');
    if (input && countEl) {
      countEl.textContent = `${input.value.length} حرف`;
    }
  }

  window.toggleTabPublishMode = function(mode) {
    const schedBox = document.getElementById('tab-buffer-schedule-box');
    const btnText = document.getElementById('tab-buffer-submit-btn-text');
    if (mode === 'schedule') {
      if (schedBox) schedBox.style.display = 'block';
      if (btnText) btnText.textContent = '📅 جدولة النشر عبر Buffer';
    } else {
      if (schedBox) schedBox.style.display = 'none';
      if (btnText) btnText.textContent = '⚡ نشر فوري الآن على TikTok';
    }
  };

  window.saveTabSettings = function() {
    const cName = document.getElementById('tab-setting-cloud-name')?.value.trim() || '';
    const cPreset = document.getElementById('tab-setting-upload-preset')?.value.trim() || '';
    const bToken = document.getElementById('tab-setting-buffer-token')?.value.trim() || '';
    const bTags = document.getElementById('tab-setting-default-hashtags')?.value.trim() || '';

    saveStoredSettings({
      cloudName: cName,
      uploadPreset: cPreset,
      bufferToken: bToken,
      defaultHashtags: bTags
    });

    showToastNotification('✅ تم حفظ إعدادات Cloudinary و Buffer بنجاح');
    refreshTikTokTabChannels();
  };

  window.executeTikTokTabPublish = async function() {
    if (!currentTabSelectedVideo || (!currentTabSelectedVideo.blob && !currentTabSelectedVideo.url)) {
      alert('الرجاء اختيار فيديو من الأرشيف أولاً!');
      return;
    }

    const settings = getStoredSettings();
    if (!settings.cloudName || !settings.uploadPreset) {
      alert('يرجى إدخال Cloud Name و Upload Preset لحساب Cloudinary في الإعدادات أدناه.');
      return;
    }
    if (!settings.bufferToken) {
      alert('يرجى إدخال مفتاح Buffer API Token في الإعدادات أدناه.');
      return;
    }

    const channelSelect = document.getElementById('tab-buffer-channel-select');
    const channelId = channelSelect ? channelSelect.value : '';
    if (!channelId) {
      alert('يرجى اختيار حساب TikTok.');
      return;
    }

    const isSchedule = document.querySelector('input[name="tab-buffer-publish-type"]:checked')?.value === 'schedule';
    const scheduleInput = document.getElementById('tab-buffer-schedule-time');
    const scheduledAt = isSchedule && scheduleInput ? scheduleInput.value : null;

    if (isSchedule && !scheduledAt) {
      alert('يرجى تحديد تاريخ ووقت الجدولة.');
      return;
    }

    const captionText = document.getElementById('tab-buffer-caption-text')?.value || '';

    const submitBtn = document.getElementById('tab-buffer-submit-btn');
    const progressBox = document.getElementById('tab-buffer-progress-box');
    const statusMsg = document.getElementById('tab-buffer-status-msg');
    const pFill = document.getElementById('tab-buffer-progress-fill');
    const pText = document.getElementById('tab-buffer-progress-percent');
    const resultBox = document.getElementById('tab-buffer-result-box');

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.pointerEvents = 'none';
    }
    if (progressBox) progressBox.style.display = 'block';
    if (resultBox) resultBox.style.display = 'none';

    try {
      if (statusMsg) statusMsg.textContent = '1/2 ☁️ جاري استضافة الفيديو على Cloudinary...';
      let videoSource = null;

      if (currentTabSelectedVideo.blob) {
        videoSource = currentTabSelectedVideo.blob;
      } else if (currentTabSelectedVideo.url) {
        if (currentTabSelectedVideo.url.startsWith('blob:')) {
          const res = await fetch(currentTabSelectedVideo.url);
          videoSource = await res.blob();
        } else {
          videoSource = currentTabSelectedVideo.url;
        }
      }

      if (!videoSource) throw new Error('لم يتم العثور على ملف الفيديو للرفع.');

      const cloudinaryUrl = await uploadToCloudinary(
        videoSource,
        settings.cloudName,
        settings.uploadPreset,
        (percent) => {
          if (pFill) pFill.style.width = `${Math.min(percent, 90)}%`;
          if (pText) pText.textContent = `${percent}% (استضافة Cloudinary)`;
        }
      );

      if (pFill) pFill.style.width = '95%';
      if (pText) pText.textContent = '95%';
      if (statusMsg) {
        statusMsg.textContent = isSchedule 
          ? '2/2 📅 جاري جدولة المنشور عبر Buffer...'
          : '2/2 ⚡ جاري إرسال المنشور للنشر الفوري على TikTok...';
      }

      const channelName = channelSelect.options[channelSelect.selectedIndex]?.textContent || 'TikTok';

      await publishToBuffer({
        bufferToken: settings.bufferToken,
        channelId: channelId,
        text: captionText,
        videoUrl: cloudinaryUrl,
        scheduledAt: scheduledAt,
        isNow: !isSchedule
      });

      addPublishHistoryEntry({
        title: currentTabSelectedVideo.title,
        cleanTitle: currentTabSelectedVideo.cleanTitle,
        videoUrl: currentTabSelectedVideo.url,
        cloudinaryUrl: cloudinaryUrl,
        scheduledAt: scheduledAt,
        isNow: !isSchedule,
        channelName: channelName
      });

      if (pFill) pFill.style.width = '100%';
      if (pText) pText.textContent = '100% اكتمل!';
      if (statusMsg) statusMsg.textContent = '🎉 تمت العملية بنجاح!';

      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 14px; text-align: center; margin-top: 15px;">
            <div style="font-size: 22px; margin-bottom: 6px;">✨ ${isSchedule ? 'تمت جدولة الفيديو بنجاح!' : 'تم النشر بنجاح على TikTok!'}</div>
            <p style="font-size: 13px; color: rgba(255,255,255,0.9); margin-bottom: 6px;">
              ${isSchedule ? `📅 الموعد: <strong>${new Date(scheduledAt).toLocaleString('ar-EG')}</strong>` : '🚀 تم النشر على حسابك بنجاح.'}
            </p>
            <div style="font-size: 11px; color: rgba(255,255,255,0.6);">
              🔗 رابط الاستضافة: <a href="${cloudinaryUrl}" target="_blank" style="color: #a855f7; text-decoration: underline;">فتح الفيديو المباشر</a>
            </div>
          </div>
        `;
      }

      showToastNotification(isSchedule ? '📅 تمت جدولة الفيديو على TikTok بنجاح!' : '🚀 تم نشر الفيديو على TikTok بنجاح!');
      renderTikTokTabPublishHistory();
    } catch(err) {
      console.error('TikTok Publish Error:', err);
      if (statusMsg) statusMsg.textContent = `❌ فشلت العملية: ${err.message}`;
      if (pFill) pFill.style.background = '#ef4444';
      alert(`حدث خطأ:\n${err.message}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.pointerEvents = 'auto';
      }
    }
  };

  function renderTikTokTabPublishHistory() {
    const list = document.getElementById('tab-publish-history-list');
    if (!list) return;
    const history = getPublishHistory();
    if (!history || history.length === 0) {
      list.innerHTML = '<p style="font-size: 11px; color: rgba(255,255,255,0.4); text-align: center; margin: 8px 0;">لا توجد عمليات نشر سابقة بعد.</p>';
      return;
    }

    list.innerHTML = history.map(item => `
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <div>
          <span style="font-size: 12px; font-weight: 700; color: #fff;">🎬 ${item.cleanTitle || cleanTikTokTitle(item.title)}</span>
          <span style="font-size: 10px; color: rgba(255,255,255,0.5); margin-right: 8px;">(${item.isNow ? '⚡ فوري' : `📅 ${new Date(item.scheduledAt).toLocaleDateString('ar-EG')}`})</span>
        </div>
        ${item.cloudinaryUrl ? `<a href="${item.cloudinaryUrl}" target="_blank" style="font-size: 10px; color: #a855f7; text-decoration: underline;">🔗 رابط الفيديو</a>` : ''}
      </div>
    `).join('');
  }

  // 7. Direct Action from History Card
  window.openTikTokPublishFromHistory = async function(historyId) {
    if (typeof switchMainTab === 'function') switchMainTab('tiktok');
    await selectVideoFromArchiveCard(historyId);
    showToastNotification('📱 تم اختيار الفيديو في استوديو TikTok');
  };

  function showToastNotification(msg) {
    let toast = document.getElementById('rekaption-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rekaption-toast';
      toast.style.cssText = 'position:fixed;bottom:25px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;padding:12px 24px;border-radius:30px;font-weight:700;font-size:13px;box-shadow:0 8px 25px rgba(0,0,0,0.5);z-index:99999;transition:all 0.3s ease;pointer-events:none;font-family:Cairo,sans-serif;direction:rtl;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 4000);
  }

  // Export
  window.BufferCloudinaryService = {
    getStoredSettings,
    saveStoredSettings,
    cleanTikTokTitle,
    fetchYoutubeOEmbedTitle,
    generateSmartTikTokCaption,
    uploadToCloudinary,
    fetchBufferChannels,
    publishToBuffer,
    initTikTokDashboardTab,
    refreshTikTokTabChannels
  };

  document.addEventListener('DOMContentLoaded', () => {
    const tabCaption = document.getElementById('tab-buffer-caption-text');
    if (tabCaption) tabCaption.addEventListener('input', updateTabCharCount);
  });

})();
