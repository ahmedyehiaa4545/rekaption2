// ReKaption Landing Page Interactive Logic
(function() {
  function initLanding() {
    // 1. Live Karaoke Captions Simulator in Hero Mockup
    const captionLines = [
      {
        titleTop: "السر الخفي وراء",
        titleBottom: "تصدر مقاطعك للتريند!",
        words: ["خطف", "انتباه", "المشاهد", "⚡"]
      },
      {
        titleTop: "تحويل فيديو يوتيوب",
        titleBottom: "إلى شورتس بضغطة زر",
        words: ["استخراج", "أقوى", "اللحظات", "🔥"]
      },
      {
        titleTop: "تتبع سينمائي للوجوه",
        titleBottom: "بأبعاد 9:16 الذكية",
        words: ["كادر", "طولي", "احترافي", "🎯"]
      }
    ];

    let currentLineIndex = 0;
    let currentWordIndex = 0;
    let wordInterval = null;

    const titleTopEl = document.getElementById('mockup-title-top');
    const titleBottomEl = document.getElementById('mockup-title-bottom');
    const captionsInnerEl = document.getElementById('mockup-captions-inner');

    function startCaptionSimulation() {
      if (!captionsInnerEl || !titleTopEl || !titleBottomEl) return;

      const line = captionLines[currentLineIndex];
      titleTopEl.textContent = line.titleTop;
      titleBottomEl.textContent = line.titleBottom;

      // Render words in caption container
      captionsInnerEl.innerHTML = line.words
        .map((w, idx) => `<span class="caption-word" id="cap-word-${idx}">${w}</span>`)
        .join(' ');

      currentWordIndex = 0;
      if (wordInterval) clearInterval(wordInterval);

      wordInterval = setInterval(() => {
        // Deactivate all words
        document.querySelectorAll('.caption-word').forEach(w => w.classList.remove('active'));

        if (currentWordIndex < line.words.length) {
          const activeWordEl = document.getElementById(`cap-word-${currentWordIndex}`);
          if (activeWordEl) {
            activeWordEl.classList.add('active');
          }
          currentWordIndex++;
        } else {
          clearInterval(wordInterval);
          setTimeout(() => {
            currentLineIndex = (currentLineIndex + 1) % captionLines.length;
            startCaptionSimulation();
          }, 1200);
        }
      }, 420);
    }

    startCaptionSimulation();

    // 2. Interactive FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
      const questionBtn = item.querySelector('.faq-question');
      const answerDiv = item.querySelector('.faq-answer');

      if (questionBtn && answerDiv) {
        questionBtn.addEventListener('click', () => {
          const isActive = item.classList.contains('active');

          // Close all other items
          faqItems.forEach(otherItem => {
            otherItem.classList.remove('active');
            const otherAnswer = otherItem.querySelector('.faq-answer');
            if (otherAnswer) otherAnswer.style.maxHeight = null;
          });

          // Toggle clicked item
          if (!isActive) {
            item.classList.add('active');
            answerDiv.style.maxHeight = answerDiv.scrollHeight + 'px';
          }
        });
      }
    });

    // Open the first FAQ by default
    if (faqItems.length > 0) {
      const firstItem = faqItems[0];
      const firstAnswer = firstItem.querySelector('.faq-answer');
      firstItem.classList.add('active');
      if (firstAnswer) firstAnswer.style.maxHeight = firstAnswer.scrollHeight + 'px';
    }

    // 3. Smooth Scroll for Navigation Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId && targetId.length > 1) {
          const targetEl = document.querySelector(targetId);
          if (targetEl) {
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    // 4. Scroll Reveal Animations (IntersectionObserver)
    const revealElements = document.querySelectorAll('.step-card, .feature-card, .comparison-card, .stat-card');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      revealElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(25px)';
        el.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
        observer.observe(el);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanding);
  } else {
    initLanding();
  }
})();
