/* ═══════════════════════════════════════════════════
   NexaChat — Stories Logic
   ═══════════════════════════════════════════════════ */

let activeStoryGroups = [];
let currentStoryGroupIndex = 0;
let currentStoryIndex = 0;
let storyTimer = null;
const STORY_DURATION = 5000; // 5 seconds per story

document.addEventListener('DOMContentLoaded', () => {
  if (!isAuthenticated()) return;
  
  initStoriesUI();
  fetchStories();
});

function initStoriesUI() {
  const createModal = document.getElementById('create-story-modal');
  const viewModal = document.getElementById('story-viewer-modal');
  
  // Create Story Modal
  const myStoryBtn = document.getElementById('my-story-btn');
  myStoryBtn.addEventListener('click', () => {
    createModal.classList.add('active');
    document.getElementById('story-content-input').focus();
  });
  
  document.getElementById('close-story-create-btn').addEventListener('click', () => {
    createModal.classList.remove('active');
  });
  
  // Color presets
  let selectedBgColor = 'linear-gradient(135deg, #FF6B6B 0%, #FFE66D 100%)';
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      selectedBgColor = e.target.dataset.color;
      document.getElementById('story-preview-area').style.background = selectedBgColor;
    });
  });
  
  // Publish Story
  const publishBtn = document.getElementById('publish-story-btn');
  publishBtn.addEventListener('click', async () => {
    const content = document.getElementById('story-content-input').value.trim();
    if (!content) {
      showToast('Story content cannot be empty', 'error');
      return;
    }
    
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publishing...';
    
    try {
      const data = await api('/api/stories', {
        method: 'POST',
        body: { content, bgColor: selectedBgColor }
      });
      
      showToast('Story published!', 'success');
      createModal.classList.remove('active');
      document.getElementById('story-content-input').value = '';
      fetchStories(); // Refresh bar
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      publishBtn.disabled = false;
      publishBtn.textContent = 'Publish Story';
    }
  });
  
  // Viewer Modal Close
  document.getElementById('close-story-viewer-btn').addEventListener('click', closeStoryViewer);
  
  // Viewer Navigation (click right half to next, left half to prev)
  document.getElementById('story-viewer-container').addEventListener('click', (e) => {
    // ignore if clicked header/close btn
    if (e.target.closest('.story-viewer-header') || e.target.closest('.story-progress-bar')) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width / 2) {
      nextStory();
    } else {
      prevStory();
    }
  });
}

async function fetchStories() {
  try {
    const data = await api('/api/stories');
    activeStoryGroups = data.stories || [];
    renderStoriesBar();
  } catch (error) {
    console.error('Failed to fetch stories', error);
  }
}

function renderStoriesBar() {
  const bar = document.getElementById('stories-bar');
  // keep only the "Your Story" btn
  bar.innerHTML = `
    <div class="story-item" id="my-story-btn">
      <div class="story-avatar add-story">
        <span>+</span>
      </div>
      <span class="story-name">Your Story</span>
    </div>
  `;
  
  // re-attach event listener
  document.getElementById('my-story-btn').addEventListener('click', () => {
    document.getElementById('create-story-modal').classList.add('active');
    document.getElementById('story-content-input').focus();
  });
  
  activeStoryGroups.forEach((group, index) => {
    // Group contains: user, stories[]
    const avatar = group.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.user.displayName)}&background=random`;
    const userObj = getUser();
    const isCurrentUser = userObj && group.user._id === userObj._id;
    const displayName = isCurrentUser ? 'You' : group.user.displayName;
    
    // If it's the current user, replace "Your Story" button visual with their avatar but keep click-to-view logic separately?
    // Actually Gen-Z apps often combine them. We'll just render it as a standard item, 
    // but clicking it opens the viewer starting at their stories.
    
    const el = document.createElement('div');
    el.className = 'story-item';
    el.innerHTML = `
      <div class="story-avatar has-story">
        <img src="${avatar}" alt="${displayName}">
      </div>
      <span class="story-name">${displayName}</span>
    `;
    
    el.addEventListener('click', () => {
      openStoryViewer(index);
    });
    
    bar.appendChild(el);
  });
}

// ── Viewer Logic ──

function openStoryViewer(groupIndex) {
  if (groupIndex < 0 || groupIndex >= activeStoryGroups.length) return;
  
  currentStoryGroupIndex = groupIndex;
  currentStoryIndex = 0;
  
  document.getElementById('story-viewer-modal').classList.remove('hidden');
  renderCurrentStory();
}

function closeStoryViewer() {
  document.getElementById('story-viewer-modal').classList.add('hidden');
  clearTimeout(storyTimer);
}

function renderCurrentStory() {
  const group = activeStoryGroups[currentStoryGroupIndex];
  if (!group || !group.stories || group.stories.length === 0) {
    closeStoryViewer();
    return;
  }
  
  const story = group.stories[currentStoryIndex];
  
  // UI mapping
  const contentEl = document.getElementById('story-viewer-content');
  const avatarEl = document.getElementById('story-viewer-avatar');
  const nameEl = document.getElementById('story-viewer-name');
  const timeEl = document.getElementById('story-viewer-time');
  const progressFill = document.getElementById('story-progress-fill');
  
  contentEl.textContent = story.content;
  contentEl.style.background = story.bgColor;
  
  avatarEl.src = group.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.user.displayName)}&background=random`;
  nameEl.textContent = group.user.displayName;
  
  // formatted time
  const msAgo = Date.now() - new Date(story.createdAt).getTime();
  const hrsAgo = Math.floor(msAgo / (1000 * 60 * 60));
  const minsAgo = Math.floor(msAgo / (1000 * 60));
  
  timeEl.textContent = hrsAgo > 0 ? `${hrsAgo}h ago` : `${minsAgo}m ago`;
  
  // Reset animations
  progressFill.style.transition = 'none';
  progressFill.style.width = '0%';
  
  // Force reflow
  void progressFill.offsetWidth;
  
  // Start animation
  progressFill.style.transition = `width ${STORY_DURATION}ms linear`;
  progressFill.style.width = '100%';
  
  // Timer
  clearTimeout(storyTimer);
  storyTimer = setTimeout(() => {
    nextStory();
  }, STORY_DURATION);
}

function nextStory() {
  const group = activeStoryGroups[currentStoryGroupIndex];
  if (currentStoryIndex < group.stories.length - 1) {
    currentStoryIndex++;
    renderCurrentStory();
  } else {
    // moving to next user's story
    if (currentStoryGroupIndex < activeStoryGroups.length - 1) {
      currentStoryGroupIndex++;
      currentStoryIndex = 0;
      renderCurrentStory();
    } else {
      closeStoryViewer(); // all done
    }
  }
}

function prevStory() {
  if (currentStoryIndex > 0) {
    currentStoryIndex--;
    renderCurrentStory();
  } else {
    // moving to previous user's story
    if (currentStoryGroupIndex > 0) {
      currentStoryGroupIndex--;
      const group = activeStoryGroups[currentStoryGroupIndex];
      currentStoryIndex = group.stories.length - 1; // last story of prev user
      renderCurrentStory();
    } else {
      // already at first story of first user, just restart
      renderCurrentStory();
    }
  }
}
