const API_BASE = 'https://api.jikan.moe/v4';

let state = {
    currentPage: 1,
    currentType: 'popularity',
    currentSort: 'asc',
    currentGenre: null,
    currentView: 'grid',
    currentMangaId: null,
    currentManga: null,
    searchQuery: '',
    searchPage: 1,
    totalPages: 1,
    lastRequestTime: 0,
    theme: localStorage.getItem('mangaverse-theme') || 'dark',
    favorites: JSON.parse(localStorage.getItem('mangaverse-favorites') || '[]'),
    history: JSON.parse(localStorage.getItem('mangaverse-history') || '[]'),
    mode: localStorage.getItem('mangaverse-mode') || 'manga'
};

const genres = [
    { id: 1, name: 'Action' },
    { id: 2, name: 'Adventure' },
    { id: 4, name: 'Comedy' },
    { id: 8, name: 'Drama' },
    { id: 10, name: 'Fantasy' },
    { id: 14, name: 'Horror' },
    { id: 7, name: 'Mystery' },
    { id: 22, name: 'Romance' },
    { id: 24, name: 'Sci-Fi' },
    { id: 36, name: 'Slice of Life' },
    { id: 30, name: 'Sports' },
    { id: 37, name: 'Supernatural' },
    { id: 41, name: 'Thriller' },
    { id: 25, name: 'Shoujo' },
    { id: 27, name: 'Shounen' },
    { id: 42, name: 'Seinen' },
    { id: 43, name: 'Josei' }
];

function isNSFW(manga) {
    const nsfwGenreIds = [9, 12, 18, 26, 28];
    const nsfwThemes = ['Hentai', 'Ecchi'];
    const nsfwRatings = ['Rx', 'R+'];
    if (manga.genres?.some(g => nsfwGenreIds.includes(g.mal_id))) return true;
    if (manga.explicit_genres?.some(g => nsfwGenreIds.includes(g.mal_id))) return true;
    if (manga.themes?.some(t => nsfwThemes.includes(t.name))) return true;
    if (manga.rating && nsfwRatings.includes(manga.rating)) return true;
    return false;
}

async function rateLimitedFetch(url) {
    const now = Date.now();
    const timeSinceLastRequest = now - state.lastRequestTime;
    const minDelay = 350;
    if (timeSinceLastRequest < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - timeSinceLastRequest));
    }
    state.lastRequestTime = Date.now();
    const response = await fetch(url);
    if (response.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return rateLimitedFetch(url);
    }
    return response;
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyMode();
    initGenres();
    fetchTrendingContent();
    fetchContentList();
    initScrollToTop();
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchContent();
    });
});

function initScrollToTop() {
    const scrollBtn = document.getElementById('scrollToTop');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    });
}

function applyTheme() {
    document.body.classList.toggle('light-theme', state.theme === 'light');
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.innerHTML = state.theme === 'dark' ? 
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>' : 
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    }
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('mangaverse-theme', state.theme);
    applyTheme();
}

function applyMode() {
    const modeToggle = document.getElementById('modeToggle');
    const logoText = document.querySelector('.logo-text');
    const searchInput = document.getElementById('searchInput');
    
    if (state.mode === 'anime') {
        if (modeToggle) modeToggle.innerHTML = '<span class="mode-icon">📺</span><span>Anime</span>';
        if (logoText) logoText.textContent = 'AnimeVerse';
        if (searchInput) searchInput.placeholder = 'Search anime...';
        document.querySelector('.logo-icon').textContent = '🎬';
    } else {
        if (modeToggle) modeToggle.innerHTML = '<span class="mode-icon">📚</span><span>Manga</span>';
        if (logoText) logoText.textContent = 'MangaVerse';
        if (searchInput) searchInput.placeholder = 'Search manga...';
        document.querySelector('.logo-icon').textContent = '📚';
    }
}

function toggleMode() {
    state.mode = state.mode === 'manga' ? 'anime' : 'manga';
    localStorage.setItem('mangaverse-mode', state.mode);
    state.currentPage = 1;
    state.currentGenre = null;
    applyMode();
    initGenres();
    fetchTrendingContent();
    fetchContentList();
    showToast(`Switched to ${state.mode === 'anime' ? 'Anime' : 'Manga'} mode`);
}

function initGenres() {
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = `
        <button class="category-btn active" data-category="all" onclick="setGenre(null)">All</button>
        ${genres.map(genre => `
            <button class="category-btn" data-category="${genre.id}" onclick="setGenre(${genre.id})">
                ${genre.name}
            </button>
        `).join('')}
    `;
}

function showLoading() { document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.nav === 'home' && viewId === 'homeView') link.classList.add('active');
        if (link.dataset.nav === 'favorites' && viewId === 'favoritesView') link.classList.add('active');
        if (link.dataset.nav === 'history' && viewId === 'historyView') link.classList.add('active');
    });
}

async function fetchTrendingContent() {
    try {
        const endpoint = state.mode === 'anime' ? 'anime' : 'manga';
        const response = await rateLimitedFetch(`${API_BASE}/${endpoint}?order_by=popularity&limit=10`);
        const data = await response.json();
        if (data.data) {
            const trendingList = data.data.filter(m => !isNSFW(m)).slice(0, 8);
            renderTrendingCarousel(trendingList);
        }
    } catch (error) {
        console.error('Error fetching trending:', error);
    }
}

function renderTrendingCarousel(contentList) {
    const container = document.getElementById('trendingCarousel');
    if (!container || !contentList.length) return;
    container.innerHTML = contentList.map(item => `
        <div class="trending-card" onclick="openContentDetail(${item.mal_id})">
            <img src="${item.images?.jpg?.large_image_url || item.images?.jpg?.image_url}" alt="${item.title}" loading="lazy">
            <div class="trending-info">
                <h4>${item.title}</h4>
                <span class="trending-score">${item.score || 'N/A'}</span>
            </div>
        </div>
    `).join('');
}

async function fetchContentList() {
    showLoading();
    const endpoint = state.mode === 'anime' ? 'anime' : 'manga';
    const contentType = state.mode === 'anime' ? 'anime' : 'manga';
    try {
        let url = `${API_BASE}/${endpoint}?page=${state.currentPage}&limit=24&order_by=${state.currentType}`;
        if (state.currentType !== 'popularity' && state.currentType !== 'favorites') url += `&sort=${state.currentSort}`;
        if (state.currentGenre) url += `&genres=${state.currentGenre}`;
        const response = await rateLimitedFetch(url);
        const data = await response.json();
        if (data.data) {
            let contentList = data.data.filter(m => !isNSFW(m));
            renderContentGrid(contentList, 'mangaGrid');
            state.totalPages = data.pagination?.last_visible_page || 1;
            renderPagination('pagination', state.currentPage, state.totalPages, (page) => {
                state.currentPage = page;
                fetchContentList();
            });
        }
        updateViewTitle();
        showView('homeView');
    } catch (error) {
        console.error(`Error fetching ${contentType} list:`, error);
        document.getElementById('mangaGrid').innerHTML = `
            <div class="error-message">
                <h3>Oops! Something went wrong</h3>
                <p>Unable to load ${contentType}. Please try again later.</p>
            </div>
        `;
    }
    hideLoading();
}

function renderContentGrid(contentList, containerId, showRemoveBtn = false) {
    const container = document.getElementById(containerId);
    const contentType = state.mode === 'anime' ? 'anime' : 'manga';
    if (!contentList || contentList.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">📭</div>
                <h3>No ${contentType} found</h3>
                <p>Try adjusting your filters or search terms</p>
            </div>
        `;
        return;
    }
    container.classList.toggle('list-view', state.currentView === 'list');
    container.innerHTML = contentList.map(item => {
        const year = state.mode === 'anime' 
            ? (item.aired?.prop?.from?.year || (item.aired?.from ? new Date(item.aired.from).getFullYear() : null))
            : (item.published?.prop?.from?.year || (item.published?.from ? new Date(item.published.from).getFullYear() : null));
        const episodesOrChapters = state.mode === 'anime'
            ? (item.episodes ? `${item.episodes} episodes` : item.status || 'Unknown')
            : (item.chapters ? `${item.chapters} chapters` : item.status || 'Unknown');
        return `
        <div class="manga-card" onclick="openContentDetail(${item.mal_id})">
            ${isFavorite(item.mal_id) ? '<div class="favorite-badge">♥</div>' : ''}
            <img class="manga-card-image" 
                 src="${item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || 'https://via.placeholder.com/200x300?text=No+Image'}" 
                 alt="${item.title}"
                 onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'"
                 loading="lazy">
            <div class="manga-card-overlay">
                <h3 class="manga-card-title">${item.title}</h3>
                <p class="manga-card-chapter">${episodesOrChapters}${year ? ` • ${year}` : ''}</p>
                <p class="manga-card-views">${item.score || 'N/A'}</p>
            </div>
        </div>
    `}).join('');
}

function renderPagination(containerId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(containerId);
    const maxVisible = 5;
    let pages = [];
    const displayTotalPages = Math.min(totalPages, 25);
    if (displayTotalPages <= maxVisible) {
        pages = Array.from({ length: displayTotalPages }, (_, i) => i + 1);
    } else {
        if (currentPage <= 3) pages = [1, 2, 3, 4, '...', displayTotalPages];
        else if (currentPage >= displayTotalPages - 2) pages = [1, '...', displayTotalPages - 3, displayTotalPages - 2, displayTotalPages - 1, displayTotalPages];
        else pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', displayTotalPages];
    }
    container.innerHTML = `
        <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>
        ${pages.map(page => page === '...' ? '<span class="page-btn" style="cursor: default;">...</span>' : `<button class="page-btn ${page === currentPage ? 'active' : ''}">${page}</button>`).join('')}
        <button class="page-btn" ${currentPage === displayTotalPages ? 'disabled' : ''}>Next</button>
    `;
    const buttons = container.querySelectorAll('.page-btn');
    buttons[0].onclick = () => { if (currentPage > 1) onPageChange(currentPage - 1); };
    buttons[buttons.length - 1].onclick = () => { if (currentPage < displayTotalPages) onPageChange(currentPage + 1); };
    buttons.forEach((btn, index) => {
        if (index > 0 && index < buttons.length - 1 && btn.textContent !== '...') {
            btn.onclick = () => onPageChange(parseInt(btn.textContent));
        }
    });
}

function updateViewTitle() {
    const titles = { popularity: 'Most Popular', score: 'Top Rated', start_date: 'Newest', favorites: 'Most Favorited' };
    let title = titles[state.currentType] || 'Manga';
    if (state.currentGenre) {
        const genre = genres.find(g => g.id === state.currentGenre);
        if (genre) title += ` - ${genre.name}`;
    }
    document.getElementById('currentViewTitle').textContent = title;
}

function setType(type) { 
    state.currentType = type; 
    state.currentPage = 1; 
    state.currentSort = (type === 'popularity' || type === 'favorites') ? 'asc' : 'desc'; 
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.type === type)); 
    fetchContentList(); 
}

function setGenre(genreId) { 
    state.currentGenre = genreId; 
    state.currentPage = 1; 
    document.querySelectorAll('.category-btn').forEach(btn => { 
        const btnCategory = btn.dataset.category; 
        btn.classList.toggle('active', genreId === null ? btnCategory === 'all' : btnCategory == genreId); 
    }); 
    fetchContentList(); 
}

function setView(view) { 
    state.currentView = view; 
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view)); 
    const grid = document.getElementById('mangaGrid'); 
    grid.classList.toggle('list-view', view === 'list'); 
}

async function searchContent() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    state.searchQuery = query;
    state.searchPage = 1;
    showLoading();
    const endpoint = state.mode === 'anime' ? 'anime' : 'manga';
    try {
        const response = await rateLimitedFetch(`${API_BASE}/${endpoint}?q=${encodeURIComponent(query)}&page=${state.searchPage}&limit=24`);
        const data = await response.json();
        document.getElementById('searchTitle').textContent = `Search Results for "${query}"`;
        if (data.data && data.data.length > 0) {
            let contentList = data.data.filter(m => !isNSFW(m));
            renderContentGrid(contentList, 'searchResults');
            state.totalPages = data.pagination?.last_visible_page || 1;
            renderPagination('searchPagination', state.searchPage, Math.min(state.totalPages, 25), (page) => { state.searchPage = page; performSearch(query, page); });
        } else {
            document.getElementById('searchResults').innerHTML = `<div class="no-results"><div class="no-results-icon">🔍</div><h3>No results found</h3><p>Try different keywords</p></div>`;
            document.getElementById('searchPagination').innerHTML = '';
        }
        showView('searchResultsView');
    } catch (error) { console.error('Error searching:', error); }
    hideLoading();
}

async function performSearch(query, page) {
    showLoading();
    const endpoint = state.mode === 'anime' ? 'anime' : 'manga';
    try {
        const response = await rateLimitedFetch(`${API_BASE}/${endpoint}?q=${encodeURIComponent(query)}&page=${page}&limit=24`);
        const data = await response.json();
        if (data.data) {
            let contentList = data.data.filter(m => !isNSFW(m));
            renderContentGrid(contentList, 'searchResults');
            renderPagination('searchPagination', page, Math.min(state.totalPages, 25), (newPage) => { state.searchPage = newPage; performSearch(query, newPage); });
        }
    } catch (error) { console.error('Error performing search:', error); }
    hideLoading();
}

async function openContentDetail(contentId) {
    showLoading();
    state.currentMangaId = contentId;
    const endpoint = state.mode === 'anime' ? 'anime' : 'manga';
    const contentType = state.mode === 'anime' ? 'anime' : 'manga';
    try {
        const response = await rateLimitedFetch(`${API_BASE}/${endpoint}/${contentId}/full`);
        const data = await response.json();
        const content = data.data;
        if (isNSFW(content)) { hideLoading(); return alert("This content is NSFW and cannot be displayed."); }
        state.currentManga = content;
        addToHistory(content);
        
        const statusClass = state.mode === 'anime'
            ? (content.status?.toLowerCase().includes('airing') ? 'ongoing' : 'completed')
            : (content.status?.toLowerCase().includes('publishing') ? 'ongoing' : 'completed');
        const isFav = isFavorite(contentId);
        
        const creatorLabel = state.mode === 'anime' ? 'Studio' : 'Author';
        const creators = state.mode === 'anime'
            ? (content.studios?.map(s => s.name).join(', ') || 'Unknown Studio')
            : (content.authors?.map(a => a.name).join(', ') || 'Unknown Author');
        
        const detailHtml = `
            <div class="manga-detail-cover">
                <img src="${content.images?.jpg?.large_image_url || content.images?.jpg?.image_url}" alt="${content.title}" onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
                <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(${contentId}); event.stopPropagation();">
                    <span class="fav-icon">${isFav ? '♥' : '♡'}</span>
                    <span>${isFav ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                </button>
            </div>
            <div class="manga-detail-info">
                <h1 class="manga-detail-title">${content.title}</h1>
                ${content.title_english && content.title_english !== content.title ? `<p class="manga-detail-alt-title">${content.title_english}</p>` : ''}
                <p class="manga-detail-author">${creators}</p>
                <div class="manga-detail-meta">
                    <span class="meta-item status-${statusClass}">${content.status || 'Unknown'}</span>
                    ${content.score ? `<span class="meta-item">${content.score} / 10</span>` : ''}
                    ${content.scored_by ? `<span class="meta-item">${formatNumber(content.scored_by)} ratings</span>` : ''}
                    ${content.members ? `<span class="meta-item">${formatNumber(content.members)} members</span>` : ''}
                    ${state.mode === 'anime' 
                        ? (content.episodes ? `<span class="meta-item">${content.episodes} episodes</span>` : '')
                        : (content.chapters ? `<span class="meta-item">${content.chapters} chapters</span>` : '')}
                    ${state.mode === 'anime'
                        ? (content.duration ? `<span class="meta-item">${content.duration}</span>` : '')
                        : (content.volumes ? `<span class="meta-item">${content.volumes} volumes</span>` : '')}
                </div>
                ${content.genres?.length ? `
                <div class="manga-detail-genres">
                    ${content.genres.map(g => `<span class="genre-tag" onclick="setGenre(${g.mal_id}); goHome();">${g.name}</span>`).join('')}
                </div>` : ''}
                ${content.trailer?.embed_url ? `
                <div class="trailer-section">
                    <h3>Trailer</h3>
                    <div class="trailer-container">
                        <iframe 
                            src="${content.trailer.embed_url.replace('autoplay=1', 'autoplay=0')}" 
                            frameborder="0" 
                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen>
                        </iframe>
                    </div>
                </div>
                ` : ''}
                <div class="manga-detail-description">
                    <h3>Synopsis</h3>
                    <p>${content.synopsis || 'No description available.'}</p>
                    ${content.background ? `<h3 style="margin-top:1rem;">Background</h3><p>${content.background}</p>` : ''}
                </div>
                <div class="external-links">
                    <a href="${content.url}" target="_blank" class="external-link mal-link">View on MyAnimeList</a>
                </div>
            </div>
        `;
        document.getElementById('mangaDetail').innerHTML = detailHtml;
        showView('mangaDetailView');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error(`Error fetching ${contentType} detail:`, error);
        document.getElementById('mangaDetail').innerHTML = `<div class="error-message"><h3>Failed to load ${contentType} details</h3><p>Please try again later.</p></div>`;
        showView('mangaDetailView');
    }
    hideLoading();
}

function isFavorite(mangaId) {
    return state.favorites.some(f => f.mal_id === mangaId);
}

function toggleFavorite(contentId) {
    const content = state.currentManga;
    if (!content) return;
    const index = state.favorites.findIndex(f => f.mal_id === contentId);
    if (index > -1) {
        state.favorites.splice(index, 1);
        showToast('Removed from favorites');
    } else {
        state.favorites.unshift({
            mal_id: content.mal_id,
            title: content.title,
            images: content.images,
            chapters: content.chapters,
            episodes: content.episodes,
            status: content.status,
            score: content.score,
            published: content.published,
            aired: content.aired,
            type: state.mode
        });
        showToast('Added to favorites!');
    }
    localStorage.setItem('mangaverse-favorites', JSON.stringify(state.favorites));
    openContentDetail(contentId);
}

function addToHistory(content) {
    state.history = state.history.filter(h => h.mal_id !== content.mal_id);
    state.history.unshift({
        mal_id: content.mal_id,
        title: content.title,
        images: content.images,
        chapters: content.chapters,
        episodes: content.episodes,
        status: content.status,
        score: content.score,
        published: content.published,
        aired: content.aired,
        type: state.mode,
        viewedAt: Date.now()
    });
    if (state.history.length > 50) state.history = state.history.slice(0, 50);
    localStorage.setItem('mangaverse-history', JSON.stringify(state.history));
}

function showFavorites() {
    const countEl = document.getElementById('favoritesCount');
    if (countEl) {
        countEl.textContent = state.favorites.length > 0 ? `(${state.favorites.length} items)` : '';
    }
    if (state.favorites.length === 0) {
        document.getElementById('favoritesGrid').innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">♡</div>
                <h3>No favorites yet</h3>
                <p>Start adding content to your favorites!</p>
            </div>
        `;
    } else {
        renderFavoritesGrid(state.favorites, 'favoritesGrid');
    }
    showView('favoritesView');
}

function renderFavoritesGrid(contentList, containerId) {
    const container = document.getElementById(containerId);
    if (!contentList || contentList.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">📭</div>
                <h3>No content found</h3>
                <p>Try adjusting your filters or search terms</p>
            </div>
        `;
        return;
    }
    container.classList.toggle('list-view', state.currentView === 'list');
    container.innerHTML = contentList.map(item => {
        const isAnime = item.type === 'anime';
        const year = isAnime 
            ? (item.aired?.prop?.from?.year || (item.aired?.from ? new Date(item.aired.from).getFullYear() : null))
            : (item.published?.prop?.from?.year || (item.published?.from ? new Date(item.published.from).getFullYear() : null));
        const episodesOrChapters = isAnime
            ? (item.episodes ? `${item.episodes} episodes` : item.status || 'Unknown')
            : (item.chapters ? `${item.chapters} chapters` : item.status || 'Unknown');
        return `
        <div class="manga-card" onclick="openFavoriteDetail(${item.mal_id}, '${item.type || 'manga'}')">
            ${isFavorite(item.mal_id) ? '<div class="favorite-badge">♥</div>' : ''}
            <img class="manga-card-image" 
                 src="${item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || 'https://via.placeholder.com/200x300?text=No+Image'}" 
                 alt="${item.title}"
                 onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'"
                 loading="lazy">
            <div class="manga-card-overlay">
                <h3 class="manga-card-title">${item.title}</h3>
                <p class="manga-card-chapter">${episodesOrChapters}${year ? ` • ${year}` : ''}</p>
                <p class="manga-card-views">${item.score || 'N/A'}</p>
            </div>
        </div>
    `}).join('');
}

async function openFavoriteDetail(contentId, contentType) {
    state.mode = contentType;
    localStorage.setItem('mangaverse-mode', state.mode);
    applyMode();
    await openContentDetail(contentId);
}

function showHistory() {
    const animeHistory = state.history.filter(h => h.type === 'anime');
    const mangaHistory = state.history.filter(h => h.type === 'manga' || !h.type);
    
    const animeCountEl = document.getElementById('animeHistoryCount');
    const mangaCountEl = document.getElementById('mangaHistoryCount');
    
    if (animeCountEl) animeCountEl.textContent = animeHistory.length > 0 ? `(${animeHistory.length})` : '';
    if (mangaCountEl) mangaCountEl.textContent = mangaHistory.length > 0 ? `(${mangaHistory.length})` : '';
    
    if (animeHistory.length === 0) {
        document.getElementById('animeHistoryGrid').innerHTML = `
            <div class="no-results no-results-small">
                <div class="no-results-icon">📺</div>
                <h3>No watch history</h3>
                <p>Anime you view will appear here</p>
            </div>
        `;
    } else {
        renderFavoritesGrid(animeHistory, 'animeHistoryGrid');
    }
    
    if (mangaHistory.length === 0) {
        document.getElementById('mangaHistoryGrid').innerHTML = `
            <div class="no-results no-results-small">
                <div class="no-results-icon">📚</div>
                <h3>No reading history</h3>
                <p>Manga you view will appear here</p>
            </div>
        `;
    } else {
        renderFavoritesGrid(mangaHistory, 'mangaHistoryGrid');
    }
    
    showView('historyView');
}

function clearHistory() {
    if (confirm('Clear all reading history?')) {
        state.history = [];
        localStorage.setItem('mangaverse-history', JSON.stringify(state.history));
        showHistory();
        showToast('History cleared');
    }
}

async function getRandomContent() {
    showLoading();
    const endpoint = state.mode === 'anime' ? 'anime' : 'manga';
    const contentType = state.mode === 'anime' ? 'anime' : 'manga';
    try {
        const randomPage = Math.floor(Math.random() * 100) + 1;
        const response = await rateLimitedFetch(`${API_BASE}/${endpoint}?page=${randomPage}&limit=25&order_by=popularity`);
        const data = await response.json();
        if (data.data && data.data.length > 0) {
            const safeContent = data.data.filter(m => !isNSFW(m));
            if (safeContent.length > 0) {
                const randomItem = safeContent[Math.floor(Math.random() * safeContent.length)];
                openContentDetail(randomItem.mal_id);
                return;
            }
        }
        showToast(`Could not find random ${contentType}. Try again!`);
    } catch (error) {
        console.error(`Error getting random ${contentType}:`, error);
        showToast(`Error loading random ${contentType}`);
    }
    hideLoading();
}

function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function formatNumber(num) { 
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'; 
    else if (num >= 1000) return (num / 1000).toFixed(1) + 'K'; 
    return num.toString(); 
}

function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }
function goHome() { state.currentPage = 1; document.getElementById('searchInput').value = ''; fetchContentList(); }
function goBack() { showView('homeView'); }
function showCategories() { document.getElementById('sidebar').scrollIntoView({ behavior: 'smooth' }); document.querySelectorAll('.nav-link').forEach(link => { link.classList.toggle('active', link.dataset.nav === 'categories'); }); }
