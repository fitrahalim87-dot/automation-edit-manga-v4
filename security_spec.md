# Security Specifications - Auto Edit Manga

## Data Invariants
1. **User Profiles**:
   - `uid` must strictly match the authenticated user's standard Firestore rules `request.auth.uid`.
   - `email` must match the authenticated user's email `request.auth.token.email`.

2. **Manga Projects**:
   - `userId` must strictly match the authenticated user's ID `request.auth.uid`.
   - Projects can only be accessed (read, written, updated, deleted) by the workspace owner (`userId == request.auth.uid`).
   - Project name, global script, and panels are required. The document ID must be valid.

---

## The "Dirty Dozen" Payloads
These payloads attempt to bypass identity or schema constraints. Our Firestore Security Rules will reject all of them.

1. **Spoofed User Creation (Wrong UID)**
   - Path: `user_profiles/malicious_user`
   - Payload: `{ "uid": "innocent_target", "email": "innocent@example.com", "displayName": "Sneaky" }`
   - *Expectation*: Rejected because `request.auth.uid != "malicious_user"`.

2. **Unverified Email Signup**
   - Path: `user_profiles/user_123`
   - Payload: `{ "uid": "user_123", "email": "spoof@gmail.com", "displayName": "Shadow" }` (with auth email unverified or mismatch)
   - *Expectation*: Rejected because we mandate `request.auth.token.email_verified == true`.

3. **Insert Extra System Field (Ghost Field)**
   - Path: `user_profiles/user_123`
   - Payload: `{ "uid": "user_123", "email": "user_123@gmail.com", "displayName": "Normal", "role": "admin" }`
   - *Expectation*: Rejected because of strict key size and content schema validation (`keys().size()`).

4. **Add Project under Another User ID**
   - Path: `manga_projects/proj_abc`
   - Payload: `{ "id": "proj_abc", "userId": "another_victim", "name": "Heist", "globalScript": "", "panelsJson": "[]" }`
   - *Expectation*: Rejected because `userId` must match `request.auth.uid`.

5. **Read Another User's Saved Project**
   - Operation: `GET /manga_projects/victim_proj`
   - Actor: `user_malicious`
   - *Expectation*: Rejected because the document on path contains `userId: "user_victim"` which does not match `request.auth.uid`.

6. **Blanket Query Scraping (Insecure List)**
   - Operation: List query on `/manga_projects`
   - Actor: `user_malicious` attempting to broad load without filtering.
   - *Expectation*: Rejected because of rule-side query enforcement (`resource.data.userId == request.auth.uid`).

7. **Injecting Poisoned Long String ID**
   - Path: `manga_projects/proj_` + ("A" * 150)
   - *Expectation*: Rejected because document ID size exceeds normalized limits or does not match `isValidId` patterns.

8. **Malicious Client Timestamp Spoofing**
   - Path: `manga_projects/proj_abc`
   - Payload: `{ "id": "proj_abc", "userId": "user_123", "name": "TimeTravel", "globalScript": "", "panelsJson": "[]", "createdAt": "2010-01-01T00:00:00Z" }`
   - *Expectation*: Rejected because temporal integrity mandates `createdAt == request.time`.

9. **Injecting Negative/Null Fields**
   - Path: `manga_projects/proj_abc`
   - Payload: `{ "id": "proj_abc", "userId": "user_123", "name": null, "globalScript": null, "panelsJson": null }`
   - *Expectation*: Rejected because schema validates fields are valid string typings.

10. **Mutating Immortal Field `userId`**
    - Operation: Update on `manga_projects/proj_abc`
    - Payload: `{ "id": "proj_abc", "userId": "hacker", "name": "Rerouted Story" }`
    - *Expectation*: Rejected because `userId` must match `existing().userId`.

11. **Malicious Project Size Exhaustion (Denial of Wallet)**
    - Path: `manga_projects/proj_abc`
    - Payload: `{ "id": "proj_abc", "userId": "user_123", "name": "X" * 10000, "globalScript": "", "panelsJson": "[]" }`
    - *Expectation*: Rejected because `name` string size is bounded.

12. **Bypassing Updates via Shadow Keys**
    - Operation: Update on `manga_projects/proj_abc` with custom system keys.
    - *Expectation*: Rejected because update actions are whitelisted precisely via `.affectedKeys().hasOnly()`.
