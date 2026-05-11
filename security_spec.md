# Security Specification - XGhostwriter

## Data Invariants
1. A history entry cannot exist without a matching `userId` in the document data that matches the authenticated user and the parent path ID.
2. User profile documents can only be read or written by the authenticated owner.
3. Timestamps for creation and login must match `request.time`.

## The "Dirty Dozen" Payloads (Denial Expected)
1. **Identity Spoofing**: Attempt to create history for another user.
2. **Shadow Field Injection**: Adding `isAdmin: true` to user profile.
3. **ID Poisoning**: Using a 2KB string as `historyId`.
4. **Timestamp Fraud**: Providing a past client-side timestamp for `lastLogin`.
5. **PII Leak**: Authenticated user 'A' attempts to 'get' user 'B's profile.
6. **Query Scraping**: `allow list: if isSignedIn()` without `resource.data.userId` check (if it were implemented that way).
7. **Type Poisoning**: Sending `timestamp` as a string instead of a timestamp object.
8. **Size Attack**: Sending a 1MB string in the `topic` field.
9. **State Shortcut**: (N/A for this app as it's mostly logs).
10. **Orphaned Write**: (N/A as history is in a subcollection, but usually means missing parent).
11. **Malicious ID**: Using `__proto__` as an ID.
12. **Key Bloating**: Adding 500 extra keys to the `request` map.

## Test Runner (Mock Tests)
- `test('spoofing', () => assertFails(createHistoryAsOtherUser))`
- `test('profile_leak', () => assertFails(readOtherProfile))`
- `test('id_poisoning', () => assertFails(createWithLargeId))`
