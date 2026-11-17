# Test Plan: Default Clinic Lists Per Station

## Summary of Current Implementation

### What Exists
- ✅ UI checkbox "Set as default list" when creating a clinic list
- ✅ API accepts `userDefault` boolean field in POST `/api/clinic-lists`
- ✅ Lists display a "Default" tag badge in the UI when `userDefault=true`
- ✅ Lists are associated with a `stationId`
- ✅ Search/filter functionality supports filtering by `stationId`

### What's Missing
- ❌ **No logic to retrieve the default list for a specific station**
- ❌ **No validation to prevent multiple default lists per station/user**
- ❌ **No endpoint like `GET /api/clinic-lists/default/:stationId`**
- ❌ **No automatic use of default lists in appointment creation workflow**
- ❌ **No DELETE endpoint for lists (cleanup not possible via API)**

## Key Questions to Answer

1. **Should there be only ONE default list per station per user?**
   - Current: API allows unlimited defaults per station
   - Expected: Probably should enforce one default per station/user combo

2. **How should the default list be used?**
   - When user selects a station, should the default list auto-populate?
   - Should appointment creation workflow prefer the default list?
   - Is this just for UI organization, or functional behavior?

3. **What happens with multiple users at the same station?**
   - Can each user have their own default list for a station?
   - Or is there one system-wide default per station?

## Test Scenarios

### Scenario 1: Basic Default List Creation
**Steps:**
1. Create a clinic list for station 500 with `userDefault: true`
2. Verify list is created successfully
3. Search for lists in station 500
4. Verify the list shows `userDefault: true` in response
5. Check UI displays "Default" badge

**Expected:** List created with default flag set

### Scenario 2: Multiple Defaults Per Station
**Steps:**
1. Create first default list for station 500 (user A)
2. Create second default list for station 500 (user A)
3. Search for default lists in station 500

**Current Behavior:** Both lists are created with `userDefault: true`

**Question:** Should API prevent this? Should it:
- Return error: "Default list already exists for this station/user"
- Automatically unset previous default
- Allow multiple defaults (current behavior)

### Scenario 3: Default Lists Across Stations
**Steps:**
1. Create default list for station 500
2. Create default list for station 593
3. Create non-default list for station 500
4. Search by station 500 and filter for defaults
5. Search by station 593 and filter for defaults

**Expected:** Each station can have its own default list(s)

### Scenario 4: Retrieving Default List
**Steps:**
1. Create default list for station 500
2. Try to retrieve: `GET /api/clinic-lists/default/500`

**Current:** Endpoint doesn't exist (404)

**Recommendation:** Implement this endpoint to return:
```json
{
  "success": true,
  "defaultList": {
    "id": "...",
    "name": "...",
    "stationId": "500",
    "userDefault": true,
    "items": [...]
  }
}
```

### Scenario 5: Appointment Workflow Integration
**Steps:**
1. Create default list for station 500 with 3 clinics
2. In appointment creation UI, select station 500
3. Check if default list clinics are highlighted/preferred

**Current:** No integration observed

**Question:** Should selecting a station auto-filter to default list clinics?

## Automated Test Script

Run the automated test suite:

```bash
cd single-appointment-api
node test-clinic-lists-default.js
```

This will:
1. Create default lists for multiple stations
2. Test for conflict handling
3. Search and filter lists by station
4. Attempt to use non-existent default endpoint
5. Generate recommendations

## Manual UI Testing Steps

### Test 1: Create Default List via UI
1. Start the app: `npm start`
2. Open browser: `http://localhost:4010`
3. Navigate to **Clinic Lists** tab
4. Click **Create New List**
5. Fill in:
   - Name: "Test Default 500"
   - Station ID: 500
   - ✅ Check "Set as default list"
6. Click **Create List**
7. Verify "Default" badge appears on list card

### Test 2: Create Second Default for Same Station
1. Click **Create New List** again
2. Fill in:
   - Name: "Test Default 500 #2"
   - Station ID: 500
   - ✅ Check "Set as default list"
3. Click **Create List**
4. Search for station 500 lists
5. **Check:** Are both marked as default?

### Test 3: Search by Station
1. Create lists:
   - Default list for station 500
   - Non-default list for station 500
   - Default list for station 593
2. Search with Station ID: 500
3. Verify both default and non-default lists appear
4. Note: No way to filter "only defaults"

### Test 4: Use in Appointment Creation
1. Go to **Appointments** tab
2. Select a clinic
3. **Observe:** Does it use default list? No indication seen.

## Recommended Enhancements

### Backend Changes

#### 1. Add Default List Retrieval Endpoint
```javascript
// src/routes/clinicLists.js
router.get('/default/:stationId', handleGetDefaultList);

// src/controllers/clinicListController.js
async function handleGetDefaultList(req, res, next) {
  try {
    const { stationId } = req.params;
    const userId = req.user?.id; // from JWT
    
    const lists = await searchLists();
    const defaultList = lists.find(list => 
      String(list.stationId) === String(stationId) &&
      String(list.userId) === String(userId) &&
      list.userDefault === true
    );
    
    if (!defaultList) {
      return res.status(404).json({
        success: false,
        error: 'No default list found for this station'
      });
    }
    
    // Get items for the default list
    const items = await getListItems(defaultList.id);
    
    res.json({ 
      success: true, 
      defaultList: { ...defaultList, items } 
    });
  } catch (err) {
    next(err);
  }
}
```

#### 2. Add Validation for Single Default
```javascript
// Before creating a list with userDefault: true
if (listData.userDefault) {
  const existingLists = await searchLists();
  const hasExistingDefault = existingLists.some(list =>
    String(list.stationId) === String(listData.stationId) &&
    String(list.userId) === String(listData.userId) &&
    list.userDefault === true
  );
  
  if (hasExistingDefault) {
    return res.status(400).json({
      success: false,
      error: 'A default list already exists for this station. Please unset it first.'
    });
  }
}
```

#### 3. Add Delete List Endpoint
```javascript
// src/routes/clinicLists.js
router.delete('/:listId', handleDeleteList);
```

### Frontend Changes

#### 1. Auto-Load Default List When Station Selected
```javascript
// In appointment creation flow
async function onStationChange(stationId) {
  try {
    const response = await fetch(`/api/clinic-lists/default/${stationId}`);
    if (response.ok) {
      const { defaultList } = await response.json();
      // Filter clinics to show default list items first
      highlightDefaultClinics(defaultList.items);
    }
  } catch (error) {
    // No default list, show all clinics
  }
}
```

#### 2. Add Default Filter in Search
```html
<label class="checkbox-label">
  <input type="checkbox" id="search-defaults-only" />
  Show only default lists
</label>
```

## Success Criteria

### Minimal Implementation (Phase 1)
- ✅ Automated test suite runs successfully
- ✅ Can create default lists per station
- ✅ Can search and identify which lists are defaults
- ✅ Document current behavior and limitations

### Full Implementation (Phase 2)
- ✅ Endpoint `GET /api/clinic-lists/default/:stationId` implemented
- ✅ Validation prevents multiple defaults per station/user
- ✅ UI auto-loads default list when station selected
- ✅ Delete list functionality added
- ✅ All tests pass with expected behavior

## Running the Tests

### Automated Tests
```bash
# Ensure app is running
npm start

# In another terminal, run tests
node test-clinic-lists-default.js
```

### Expected Output
```
TEST 1: Create default list for station 500
✓ Successfully created default list for station 500

TEST 2: Create SECOND default list for station 500
⚠ Created second default list (no conflict prevention)

TEST 5: Search for default lists in station 500
✓ Found 2 total lists for station 500
  defaultLists: 2

RECOMMENDATIONS:
1. ⚠ Consider adding validation to prevent multiple defaults
2. ⚠ Add endpoint: GET /api/clinic-lists/default/:stationId
3. ⚠ Implement auto-selection in appointment workflow
```

## Questions for Product Owner / Stakeholders

1. **Business Rule:** Should each user have ONE default list per station, or can they have multiple?

2. **Scope:** Is `userDefault` user-specific or system-wide per station?

3. **Workflow:** How should the appointment creation flow use default lists?
   - Auto-filter clinics to default list?
   - Just visual indicator?
   - Required vs. optional?

4. **Permissions:** Can users see/use other users' default lists, or only their own?

5. **Migration:** If we enforce one default per station, what happens to existing data with multiple defaults?
