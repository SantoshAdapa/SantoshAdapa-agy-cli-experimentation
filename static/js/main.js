// ----------------------------------------------------
// STATE MANAGEMENT
// ----------------------------------------------------
let allReleases = []; // Holds all release objects from backend
let selectedUpdateIds = new Set(); // Holds selected update IDs
let activeTypeFilter = 'all'; // Current active tab filter
let searchDebounceTimer = null;

// DOM Elements
const elements = {
    releasesContainer: document.getElementById('releases-container'),
    loadingSkeleton: document.getElementById('loading-skeleton'),
    emptyState: document.getElementById('empty-state'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIconDark: document.getElementById('theme-icon-dark'),
    themeIconLight: document.getElementById('theme-icon-light'),
    cacheIndicator: document.getElementById('cache-indicator'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    filterPills: document.querySelectorAll('.filter-pill'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statAnnouncements: document.getElementById('stat-announcements'),
    statFixes: document.getElementById('stat-fixes'),
    
    // Floating Bar
    floatingBar: document.getElementById('floating-action-bar'),
    selectedCount: document.getElementById('selected-count'),
    btnClearSelection: document.getElementById('btn-clear-selection'),
    btnTweetSelected: document.getElementById('btn-tweet-selected'),
    
    // Modal
    tweetModal: document.getElementById('tweet-modal'),
    modalClose: document.getElementById('modal-close'),
    tweetTemplate: document.getElementById('tweet-template'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCount: document.getElementById('char-count'),
    charWarning: document.getElementById('char-warning'),
    progressRingIndicator: document.getElementById('progress-ring-indicator'),
    tweetPreviewText: document.getElementById('tweet-preview-text'),
    btnCopyTweet: document.getElementById('btn-copy-tweet'),
    btnSubmitTweet: document.getElementById('btn-submit-tweet'),
    toastContainer: document.getElementById('toast-container'),
    btnResetFilters: document.getElementById('btn-reset-filters')
};

// ----------------------------------------------------
// TOAST NOTIFICATIONS
// ----------------------------------------------------
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✨';
    if (type === 'error') icon = '⚠️';
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
}

// ----------------------------------------------------
// INITIAL LOADING & API INTEGRATION
// ----------------------------------------------------
async function fetchReleases(force = false) {
    setLoading(true);
    try {
        const url = force ? '/api/releases?refresh=true' : '/api/releases';
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'success') {
            allReleases = data.entries;
            updateStatsDashboard();
            updateFilterCounts();
            renderTimeline();
            
            // Cache status UI indicator
            if (data.source === 'cache') {
                const date = new Date(data.timestamp * 1000);
                elements.cacheIndicator.textContent = `Cached: ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                elements.cacheIndicator.style.color = 'var(--text-secondary)';
            } else {
                elements.cacheIndicator.textContent = 'Live Feed Active';
                elements.cacheIndicator.style.color = 'var(--clr-teal)';
            }
            
            if (force) {
                showToast('Release notes successfully updated!', 'success');
            }
        } else {
            showToast(data.message || 'Error loading release notes.', 'error');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showToast('Network error while retrieving release notes.', 'error');
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading) {
    if (isLoading) {
        elements.loadingSkeleton.classList.remove('hidden');
        elements.releasesContainer.classList.add('hidden');
        elements.btnRefresh.classList.add('btn-loading');
        elements.btnRefresh.disabled = true;
    } else {
        elements.loadingSkeleton.classList.add('hidden');
        elements.releasesContainer.classList.remove('hidden');
        elements.btnRefresh.classList.remove('btn-loading');
        elements.btnRefresh.disabled = false;
    }
}

// ----------------------------------------------------
// STATS & CALCULATIONS
// ----------------------------------------------------
function updateStatsDashboard() {
    let total = 0;
    let features = 0;
    let announcements = 0;
    let fixes = 0;
    
    allReleases.forEach(entry => {
        entry.updates.forEach(update => {
            total++;
            const type = update.type.toLowerCase();
            if (type.includes('feature')) features++;
            else if (type.includes('announcement')) announcements++;
            else if (type.includes('fix')) fixes++;
        });
    });
    
    animateCounter(elements.statTotal, total);
    animateCounter(elements.statFeatures, features);
    animateCounter(elements.statAnnouncements, announcements);
    animateCounter(elements.statFixes, fixes);
}

function animateCounter(element, targetValue) {
    let current = 0;
    const duration = 800; // ms
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = Math.ceil(targetValue / steps);
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= targetValue) {
            element.textContent = targetValue;
            clearInterval(timer);
        } else {
            element.textContent = current;
        }
    }, stepTime);
}

function updateFilterCounts() {
    const counts = { all: 0, Feature: 0, Announcement: 0, Fix: 0, Change: 0, General: 0 };
    
    allReleases.forEach(entry => {
        entry.updates.forEach(update => {
            counts.all++;
            const type = update.type;
            if (counts[type] !== undefined) {
                counts[type]++;
            } else {
                counts.General++;
            }
        });
    });
    
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-feature').textContent = counts.Feature;
    document.getElementById('count-announcement').textContent = counts.Announcement;
    document.getElementById('count-fix').textContent = counts.Fix;
    document.getElementById('count-change').textContent = counts.Change;
    document.getElementById('count-general').textContent = counts.General;
}

// ----------------------------------------------------
// FILTERING & TIMELINE RENDERING
// ----------------------------------------------------
function getFilteredData() {
    const searchQuery = elements.searchInput.value.toLowerCase().trim();
    const filteredEntries = [];
    
    allReleases.forEach(entry => {
        const matchingUpdates = entry.updates.filter(update => {
            // 1. Type Filter
            if (activeTypeFilter !== 'all') {
                if (activeTypeFilter === 'General') {
                    // General matches non-standard categories
                    if (['Feature', 'Announcement', 'Fix', 'Change'].includes(update.type)) {
                        return false;
                    }
                } else if (update.type !== activeTypeFilter) {
                    return false;
                }
            }
            
            // 2. Search Query Filter
            if (searchQuery) {
                const dateMatch = entry.date.toLowerCase().includes(searchQuery);
                const typeMatch = update.type.toLowerCase().includes(searchQuery);
                const htmlMatch = update.html.toLowerCase().includes(searchQuery);
                return dateMatch || typeMatch || htmlMatch;
            }
            
            return true;
        });
        
        if (matchingUpdates.length > 0) {
            filteredEntries.push({
                ...entry,
                updates: matchingUpdates
            });
        }
    });
    
    return filteredEntries;
}

function renderTimeline() {
    const filteredData = getFilteredData();
    elements.releasesContainer.innerHTML = '';
    
    if (filteredData.length === 0) {
        elements.emptyState.classList.remove('hidden');
        return;
    }
    
    elements.emptyState.classList.add('hidden');
    
    filteredData.forEach(entry => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.textContent = entry.date;
        dateGroup.appendChild(dateHeader);
        
        const listContainer = document.createElement('div');
        listContainer.className = 'releases-list';
        
        entry.updates.forEach(update => {
            const isSelected = selectedUpdateIds.has(update.id);
            const typeClass = update.type.toLowerCase();
            
            const card = document.createElement('div');
            card.className = `release-card ${isSelected ? 'selected' : ''}`;
            card.dataset.id = update.id;
            
            card.innerHTML = `
                <div class="card-top">
                    <div class="badge-wrapper">
                        <span class="badge ${typeClass}">${update.type}</span>
                    </div>
                    <label class="select-checkbox-container">
                        <span class="custom-checkbox"></span>
                        Select
                    </label>
                </div>
                <div class="card-body">
                    ${update.html}
                </div>
                <div class="card-footer">
                    <button class="btn btn-secondary btn-sm btn-copy-card btn-icon" title="Copy text to clipboard">
                        <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy</span>
                    </button>
                    <button class="btn btn-secondary btn-sm btn-single-tweet btn-icon">
                        <svg class="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        Tweet
                    </button>
                </div>
            `;
            
            // Interaction: Select on Click (unless clicking links, copy button, or the single tweet button)
            card.addEventListener('click', (e) => {
                if (e.target.closest('a') || e.target.closest('.btn-single-tweet') || e.target.closest('.btn-copy-card')) {
                    return; // Prevent selection when clicking links/buttons
                }
                toggleUpdateSelection(update.id, card);
            });
            
            // Interaction: Copy Update Plaintext Trigger
            const copyBtn = card.querySelector('.btn-copy-card');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(update.text)
                    .then(() => {
                        showToast('Update text copied to clipboard!', 'success');
                        const labelSpan = copyBtn.querySelector('span');
                        labelSpan.textContent = 'Copied!';
                        setTimeout(() => {
                            labelSpan.textContent = 'Copy';
                        }, 1500);
                    })
                    .catch(() => {
                        showToast('Failed to copy text.', 'error');
                    });
            });
            
            // Interaction: Single Tweet Trigger
            card.querySelector('.btn-single-tweet').addEventListener('click', (e) => {
                e.stopPropagation();
                openTweetComposer([update]);
            });
            
            listContainer.appendChild(card);
        });
        
        dateGroup.appendChild(listContainer);
        elements.releasesContainer.appendChild(dateGroup);
    });
}

// ----------------------------------------------------
// SELECTION ACTION BAR SYSTEM
// ----------------------------------------------------
function toggleUpdateSelection(updateId, cardElement) {
    if (selectedUpdateIds.has(updateId)) {
        selectedUpdateIds.delete(updateId);
        cardElement.classList.remove('selected');
    } else {
        selectedUpdateIds.add(updateId);
        cardElement.classList.add('selected');
    }
    
    updateFloatingActionBar();
}

function updateFloatingActionBar() {
    const count = selectedUpdateIds.size;
    elements.selectedCount.textContent = count;
    
    if (count > 0) {
        elements.floatingBar.classList.add('visible');
    } else {
        elements.floatingBar.classList.remove('visible');
    }
}

function clearSelection() {
    selectedUpdateIds.clear();
    updateFloatingActionBar();
    // Re-render to clear visual selected classes on cards
    renderTimeline();
}

// Helper to look up update details by ID
function findUpdatesByIds(ids) {
    const updates = [];
    allReleases.forEach(entry => {
        entry.updates.forEach(u => {
            if (ids.has(u.id)) {
                updates.push({
                    ...u,
                    date: entry.date
                });
            }
        });
    });
    return updates;
}

// ----------------------------------------------------
// TWEET COMPOSER SYSTEM (MODAL & PREVIEW)
// ----------------------------------------------------
let activeComposerUpdates = [];

function openTweetComposer(updates) {
    activeComposerUpdates = updates;
    elements.tweetModal.classList.add('visible');
    
    // Default to 'default' template
    elements.tweetTemplate.value = 'default';
    generateTweetContent();
}

function closeTweetComposer() {
    elements.tweetModal.classList.remove('visible');
    activeComposerUpdates = [];
}

function generateTweetContent() {
    const templateStyle = elements.tweetTemplate.value;
    let tweetText = '';
    
    if (activeComposerUpdates.length === 0) return;
    
    const feedLink = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml";
    
    if (activeComposerUpdates.length === 1) {
        // Single Update Templates
        const update = activeComposerUpdates[0];
        const date = update.date || "";
        const typeIcon = getTypeIcon(update.type);
        
        // Clean text (remove any excessive whitespace/extra breaks)
        let descText = cleanString(update.text);
        
        switch (templateStyle) {
            case 'short':
                tweetText = `${typeIcon} BigQuery Update (${date}):\n\n${truncateText(descText, 170)}\n\nRead more: ${feedLink}`;
                break;
            case 'features':
                tweetText = `🚀 Feature Spotlight (BigQuery):\n\n💡 ${truncateText(descText, 200)}\n\n#GoogleCloud #BigQuery`;
                break;
            case 'raw':
                tweetText = descText;
                break;
            case 'default':
            default:
                tweetText = `${typeIcon} Google BigQuery Update (${date})\n\n📢 ${truncateText(descText, 180)}\n\n🔗 ${feedLink}`;
                break;
        }
    } else {
        // Multi Update (Combined Summary Templates)
        const date = activeComposerUpdates[0].date; // Use date of first item
        
        switch (templateStyle) {
            case 'short':
                tweetText = `💡 BigQuery Updates Summary:\n`;
                activeComposerUpdates.forEach((up, idx) => {
                    const cleanText = truncateText(cleanString(up.text), 60);
                    tweetText += `\n• [${up.type}] ${cleanText}`;
                });
                tweetText += `\n\nInfo: ${feedLink}`;
                break;
            case 'features':
                tweetText = `🚀 Combined BigQuery Release Notes:\n`;
                activeComposerUpdates.forEach((up) => {
                    const cleanText = truncateText(cleanString(up.text), 70);
                    tweetText += `\n🌟 ${up.type}: ${cleanText}`;
                });
                tweetText += `\n\n#GoogleCloud #BigQuery`;
                break;
            case 'raw':
                tweetText = activeComposerUpdates.map(up => `[${up.type}] ${cleanString(up.text)}`).join('\n\n');
                break;
            case 'default':
            default:
                tweetText = `📢 Multiple BigQuery Updates released:\n`;
                activeComposerUpdates.forEach((up, idx) => {
                    const cleanText = truncateText(cleanString(up.text), 70);
                    tweetText += `\n${idx+1}. [${up.type}] ${cleanText}`;
                });
                tweetText += `\n\nDetails: ${feedLink}`;
                break;
        }
    }
    
    elements.tweetTextarea.value = tweetText;
    updateTweetStats();
}

function cleanString(str) {
    return str.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

function getTypeIcon(type) {
    switch (type.toLowerCase()) {
        case 'feature': return '🚀';
        case 'announcement': return '📢';
        case 'fix': return '🔧';
        case 'change': return '🔄';
        default: return '💡';
    }
}

// Monitor Character Limits and Live Preview Updates
function updateTweetStats() {
    const text = elements.tweetTextarea.value;
    const len = text.length;
    elements.charCount.textContent = len;
    
    // Update live preview representation
    elements.tweetPreviewText.textContent = text || "Compose your update message...";
    
    // Circular Ring progress configuration
    const circle = elements.progressRingIndicator;
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const percentage = Math.min((len / 280) * 100, 100);
    const offset = circumference - (percentage / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Dynamic coloring based on length
    if (len > 280) {
        circle.style.stroke = 'var(--clr-accent)';
        elements.charWarning.classList.remove('hidden');
        elements.charCount.style.color = 'var(--clr-accent)';
    } else if (len > 250) {
        circle.style.stroke = 'var(--clr-announcement)';
        elements.charWarning.classList.add('hidden');
        elements.charCount.style.color = 'var(--clr-announcement)';
    } else {
        circle.style.stroke = 'var(--clr-teal)';
        elements.charWarning.classList.add('hidden');
        elements.charCount.style.color = 'var(--text-secondary)';
    }
}

// Action Trigger Share Intent
function shareOnTwitter() {
    const tweetText = elements.tweetTextarea.value;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(url, '_blank');
    showToast('Redirecting to X / Twitter...', 'success');
}

function copyTweetToClipboard() {
    const tweetText = elements.tweetTextarea.value;
    navigator.clipboard.writeText(tweetText)
        .then(() => {
            showToast('Tweet copied to clipboard!', 'success');
        })
        .catch(() => {
            showToast('Failed to copy text.', 'error');
        });
}

// ----------------------------------------------------
// EXPORT TO CSV
// ----------------------------------------------------
function exportToCSV() {
    const filteredData = getFilteredData();
    if (filteredData.length === 0) {
        showToast('No releases available to export.', 'error');
        return;
    }
    
    let csvContent = "Date,Update Type,Plaintext Description\r\n";
    
    filteredData.forEach(entry => {
        entry.updates.forEach(update => {
            const dateVal = `"${entry.date.replace(/"/g, '""')}"`;
            const typeVal = `"${update.type.replace(/"/g, '""')}"`;
            const textVal = `"${update.text.replace(/"/g, '""')}"`;
            
            csvContent += `${dateVal},${typeVal},${textVal}\r\n`;
        });
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `bigquery_releases_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Releases exported to CSV successfully!', 'success');
}

// ----------------------------------------------------
// THEME SWITCHER
// ----------------------------------------------------
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    if (theme === 'light') {
        elements.themeIconDark.classList.add('hidden');
        elements.themeIconLight.classList.remove('hidden');
    } else {
        elements.themeIconDark.classList.remove('hidden');
        elements.themeIconLight.classList.add('hidden');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    showToast(`Switched to ${newTheme} theme!`, 'info');
}

// ----------------------------------------------------
// EVENT LISTENERS & ROUTING
// ----------------------------------------------------
function setupEventListeners() {
    // Refresh API Action
    elements.btnRefresh.addEventListener('click', () => fetchReleases(true));
    
    // Export CSV Action
    elements.btnExportCsv.addEventListener('click', exportToCSV);
    
    // Theme Toggle Action
    elements.btnThemeToggle.addEventListener('click', toggleTheme);
    
    // Search Filters
    elements.searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (val) {
            elements.searchClear.style.display = 'block';
        } else {
            elements.searchClear.style.display = 'none';
        }
        
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            renderTimeline();
        }, 200);
    });
    
    elements.searchClear.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
        renderTimeline();
    });
    
    // Reset buttons
    elements.btnResetFilters.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
        activeTypeFilter = 'all';
        elements.filterPills.forEach(p => {
            p.classList.toggle('active', p.dataset.type === 'all');
        });
        renderTimeline();
    });
    
    // Filter Tabs
    elements.filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            elements.filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeTypeFilter = pill.dataset.type;
            renderTimeline();
        });
    });
    
    // Floating Selection bar actions
    elements.btnClearSelection.addEventListener('click', clearSelection);
    
    elements.btnTweetSelected.addEventListener('click', () => {
        const selectedUpdates = findUpdatesByIds(selectedUpdateIds);
        openTweetComposer(selectedUpdates);
    });
    
    // Modal controls
    elements.modalClose.addEventListener('click', closeTweetComposer);
    elements.tweetTemplate.addEventListener('change', generateTweetContent);
    elements.tweetTextarea.addEventListener('input', updateTweetStats);
    elements.btnCopyTweet.addEventListener('click', copyTweetToClipboard);
    elements.btnSubmitTweet.addEventListener('click', shareOnTwitter);
    
    // Close modal on background overlay click
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) {
            closeTweetComposer();
        }
    });
}

// Start
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    fetchReleases();
});
