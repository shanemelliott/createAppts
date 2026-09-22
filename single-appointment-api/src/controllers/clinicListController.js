import {
  searchLists,
  createList,
  updateList,
  getListItems,
  addItemToList,
  deleteListItem
} from '../services/clinicListService.js';

/**
 * Search clinic lists
 * Note: API returns all lists; filtering is done here based on search params
 */
async function handleSearchLists(req, res, next) {
  try {
    const searchParams = req.body || {};
    console.log('[clinicListController] Searching lists with params:', searchParams);
    
    // Get all lists from API (API doesn't support server-side filtering)
    let lists = await searchLists();
    
    // Ensure lists is an array
    lists = Array.isArray(lists) ? lists : [];
    
    // Apply client-side filtering
    if (searchParams.name) {
      const nameFilter = searchParams.name.toLowerCase();
      lists = lists.filter(list => 
        (list.name || '').toLowerCase().includes(nameFilter)
      );
    }
    
    if (searchParams.stationId) {
      lists = lists.filter(list => 
        String(list.stationId) === String(searchParams.stationId)
      );
    }
    
    if (searchParams.userId) {
      lists = lists.filter(list => 
        String(list.userId) === String(searchParams.userId)
      );
    }
    
    if (searchParams.role) {
      const roleFilter = searchParams.role.toLowerCase();
      lists = lists.filter(list => 
        (list.role || '').toLowerCase().includes(roleFilter)
      );
    }
    
    res.json({ success: true, lists });
  } catch (err) {
    console.error('[clinicListController] Search error:', err.message);
    next(err);
  }
}

/**
 * Create a new clinic list
 */
async function handleCreateList(req, res, next) {
  try {
    const listData = req.body || {};
    
    // Validate required fields
    if (!listData.name || !listData.stationId) {
      return res.status(400).json({
        success: false,
        error: 'name and stationId are required'
      });
    }

    console.log('[clinicListController] Creating list:', listData);
    
    const result = await createList(listData);
    res.json({ success: true, list: result });
  } catch (err) {
    console.error('[clinicListController] Create error:', err.message);
    next(err);
  }
}

/**
 * Update a clinic list (e.g., set as default)
 */
async function handleUpdateList(req, res, next) {
  try {
    const { listId } = req.params;
    const updateData = req.body || {};
    
    if (!listId) {
      return res.status(400).json({
        success: false,
        error: 'listId is required'
      });
    }

    console.log('[clinicListController] Updating list:', listId, updateData);
    
    // Need to get the existing list data first to merge with updates
    const lists = await searchLists();
    const existingList = lists.find(l => String(l.id) === String(listId));
    
    if (!existingList) {
      return res.status(404).json({
        success: false,
        error: 'List not found'
      });
    }
    
    // Merge existing data with updates
    const mergedData = {
      ...existingList,
      ...updateData
    };
    
    const result = await updateList(listId, mergedData);
    res.json({ success: true, list: result });
  } catch (err) {
    console.error('[clinicListController] Update error:', err.message);
    next(err);
  }
}

/**
 * Get items in a clinic list
 */
async function handleGetListItems(req, res, next) {
  try {
    const { listId } = req.params;
    
    if (!listId) {
      return res.status(400).json({
        success: false,
        error: 'listId is required'
      });
    }

    console.log('[clinicListController] Getting items for list:', listId);
    
    const items = await getListItems(listId);
    res.json({ success: true, items });
  } catch (err) {
    console.error('[clinicListController] Get items error:', err.message);
    next(err);
  }
}

/**
 * Add a clinic to a list
 */
async function handleAddItemToList(req, res, next) {
  try {
    const { listId, clinicId, clinicName } = req.params;
    const data = req.body || {};
    
    if (!listId || !clinicId || !clinicName) {
      return res.status(400).json({
        success: false,
        error: 'listId, clinicId, and clinicName are required'
      });
    }

    console.log('[clinicListController] Adding item to list:', { listId, clinicId, clinicName });
    
    const result = await addItemToList(listId, clinicId, clinicName, data);
    res.json({ success: true, item: result });
  } catch (err) {
    console.error('[clinicListController] Add item error:', err.message);
    next(err);
  }
}

/**
 * Delete an item from a list
 */
async function handleDeleteListItem(req, res, next) {
  try {
    const { listItemId } = req.params;
    
    if (!listItemId) {
      return res.status(400).json({
        success: false,
        error: 'listItemId is required'
      });
    }

    console.log('[clinicListController] Deleting item:', listItemId);
    
    const result = await deleteListItem(listItemId);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[clinicListController] Delete item error:', err.message);
    next(err);
  }
}

export {
  handleSearchLists,
  handleCreateList,
  handleUpdateList,
  handleGetListItems,
  handleAddItemToList,
  handleDeleteListItem
};
