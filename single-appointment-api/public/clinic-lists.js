// Clinic List Management Frontend
// API Base URL
const CLINIC_API_BASE = '/api/clinic-lists';

// State
let currentListId = null;
let currentListData = null;

// DOM Elements
const searchForm = document.getElementById('clinic-list-search-form');
const createListBtn = document.getElementById('create-list-btn');
const createListModal = document.getElementById('create-list-modal');
const createListForm = document.getElementById('create-list-form');
const addItemModal = document.getElementById('add-item-modal');
const addItemForm = document.getElementById('add-item-form');
const listsContainer = document.getElementById('lists-container');
const listItemsSection = document.getElementById('list-items-section');
const listItemsContainer = document.getElementById('list-items-container');
const listItemsTitle = document.getElementById('list-items-title');
const backToListsBtn = document.getElementById('back-to-lists-btn');
const addItemBtn = document.getElementById('add-item-btn');
const messagesContainer = document.getElementById('clinic-list-messages');

// Utility Functions
function showMessage(message, type = 'success') {
  const className = type === 'error' ? 'alert-error' : 'alert-success';
  messagesContainer.innerHTML = `
    <div class="alert ${className}">
      ${message}
    </div>
  `;
  setTimeout(() => {
    messagesContainer.innerHTML = '';
  }, type === 'error' ? 5000 : 3000);
}

function showError(message) {
  showMessage(message, 'error');
}

function showSuccess(message) {
  showMessage(message, 'success');
}

function showLoading(container) {
  container.innerHTML = '<div class="loading">Loading...</div>';
}

// API Functions
async function searchLists(searchData) {
  const response = await fetch(`${CLINIC_API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to search lists');
  }
  
  const data = await response.json();
  return data.lists || [];
}

async function createList(listData) {
  const response = await fetch(`${CLINIC_API_BASE}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(listData)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create list');
  }
  
  const data = await response.json();
  return data.list;
}

async function getListItems(listId) {
  const response = await fetch(`${CLINIC_API_BASE}/${listId}/items`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch list items');
  }
  
  const data = await response.json();
  return data.items || [];
}

async function addItemToList(listId, clinicId, clinicName, data = {}) {
  const url = `${CLINIC_API_BASE}/${listId}/items/${clinicId}/${encodeURIComponent(clinicName)}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add item to list');
  }
  
  const result = await response.json();
  return result.item;
}

async function deleteListItem(listItemId) {
  const response = await fetch(`${CLINIC_API_BASE}/items/${listItemId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete item');
  }
  
  return response.json();
}

// UI Functions
function displayLists(lists) {
  if (!lists || lists.length === 0) {
    listsContainer.innerHTML = '<p class="text-muted">No lists found</p>';
    return;
  }
  
  listsContainer.innerHTML = lists.map(list => `
    <div class="list-card" onclick="viewListItems('${list.id || ''}', ${JSON.stringify(list).replace(/"/g, '&quot;')})">
      <h3>${list.name || 'Unnamed List'}</h3>
      <p><strong>Station:</strong> ${list.stationId || 'N/A'} | <strong>Role:</strong> ${list.role || 'N/A'}</p>
      ${list.userDefault ? '<span class="tag">Default</span>' : ''}
    </div>
  `).join('');
}

function displayListItems(items) {
  if (!items || items.length === 0) {
    listItemsContainer.innerHTML = '<p class="text-muted">No clinics in this list</p>';
    return;
  }
  
  listItemsContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Clinic IEN</th>
          <th>Clinic Name</th>
          <th>Item ID</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.ien || item.clinicId || 'N/A'}</td>
            <td>${item.name || item.clinicName || 'N/A'}</td>
            <td>${item.id || item.listItemId || 'N/A'}</td>
            <td>
              <button onclick="deleteItem('${item.id || item.listItemId}')">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function viewListItems(listId, listData) {
  if (!listId) {
    showError('List ID is required');
    return;
  }
  
  currentListId = listId;
  currentListData = typeof listData === 'string' ? JSON.parse(listData) : listData;
  listItemsTitle.textContent = `Items in: ${currentListData.name || listId}`;
  listItemsSection.classList.remove('hidden');
  showLoading(listItemsContainer);
  
  getListItems(listId)
    .then(data => {
      displayListItems(data);
    })
    .catch(error => {
      showError(error.message);
      listItemsContainer.innerHTML = '<p class="text-error">Failed to load items</p>';
    });
}

function deleteItem(listItemId) {
  if (!confirm('Are you sure you want to delete this clinic from the list?')) {
    return;
  }
  
  deleteListItem(listItemId)
    .then(() => {
      showSuccess('Clinic removed from list');
      // Reload items
      getListItems(currentListId)
        .then(data => displayListItems(data))
        .catch(error => showError(error.message));
    })
    .catch(error => {
      showError(error.message);
    });
}

function openModal(modal) {
  modal.classList.add('show');
}

function closeModal(modal) {
  modal.classList.remove('show');
}

// Event Listeners
if (searchForm) {
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(searchForm);
    const searchData = {};
    
    for (let [key, value] of formData.entries()) {
      if (value.trim()) searchData[key] = value.trim();
    }
    
    showLoading(listsContainer);
    
    try {
      const lists = await searchLists(searchData);
      displayLists(lists);
    } catch (error) {
      showError(error.message);
      listsContainer.innerHTML = '<p class="text-muted">Failed to load lists</p>';
    }
  });
}

if (createListBtn) {
  createListBtn.addEventListener('click', () => {
    openModal(createListModal);
  });
}

if (createListForm) {
  createListForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(createListForm);
    const listData = {
      name: formData.get('name'),
      stationId: formData.get('stationId'),
      userDefault: formData.get('userDefault') === 'on'
    };
    
    // Add optional fields
    if (formData.get('userId')) listData.userId = formData.get('userId');
    if (formData.get('role')) listData.role = formData.get('role');
    
    try {
      await createList(listData);
      showSuccess('List created successfully');
      closeModal(createListModal);
      createListForm.reset();
      
      // Refresh the list
      if (searchForm) {
        searchForm.dispatchEvent(new Event('submit'));
      }
    } catch (error) {
      showError(error.message);
    }
  });
}

if (backToListsBtn) {
  backToListsBtn.addEventListener('click', () => {
    listItemsSection.classList.add('hidden');
    currentListId = null;
    currentListData = null;
  });
}

if (addItemBtn) {
  addItemBtn.addEventListener('click', () => {
    if (!currentListId) {
      showError('No list selected');
      return;
    }
    
    document.getElementById('add-list-id').value = currentListId;
    openModal(addItemModal);
  });
}

if (addItemForm) {
  addItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(addItemForm);
    const listId = formData.get('listId');
    const clinicId = formData.get('clinicId');
    const clinicName = formData.get('clinicName');
    
    try {
      await addItemToList(listId, clinicId, clinicName);
      showSuccess('Clinic added to list');
      closeModal(addItemModal);
      addItemForm.reset();
      
      // Reload items
      getListItems(currentListId)
        .then(data => displayListItems(data))
        .catch(error => showError(error.message));
    } catch (error) {
      showError(error.message);
    }
  });
}

// Modal close handlers
document.querySelectorAll('.simple-modal-close, .modal-cancel').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.simple-modal');
    if (modal) {
      closeModal(modal);
    }
  });
});

// Close modal when clicking outside
document.querySelectorAll('.simple-modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });
});

// Make viewListItems and deleteItem globally accessible for onclick handlers
window.viewListItems = viewListItems;
window.deleteItem = deleteItem;

console.log('[clinic-lists.js] Clinic list management initialized');
