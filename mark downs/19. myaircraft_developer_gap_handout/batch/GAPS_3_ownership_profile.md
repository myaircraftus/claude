# myaircraft.us — Gap Fix 3: Ownership & Profile
> Files: `SettingsPage.tsx`
> ⚠️ ADD ONLY. Do not change existing settings sections.

---

## 1. Add "My Uploads" tab/section to Settings page

Add as a new tab inside `/app/settings`.

### Data to display
Filter all documents and marketplace listings where `uploaderId === currentUser.id`.

### Table columns
| Title | Type | Aircraft | Access | Downloads | In Marketplace | Date |
|-------|------|----------|--------|-----------|----------------|------|

### Role badge per row
```tsx
const roleBadge = {
  owner:    <span className="badge-gold">Owner</span>,
  mechanic: <span className="badge-blue">Mechanic</span>,
  admin:    <span className="badge-slate">Admin</span>,
}
```

### Row actions (per uploaded item)
```tsx
// Edit access level → opens mini modal with Private/Free/Paid toggle
// Remove from community → sets communityListing = false (keeps doc, delists it)
// Delete → only if NOT a community listing. confirm() dialog first.
```

---

## 2. Seller Dashboard — uploader identity (MarketplacePage.tsx)

In the existing Seller Dashboard tab, add to each listing row:
```tsx
// Show uploader name + role badge
<span>{listing.sellerId === currentUser.id ? 'You' : listing.sellerName}</span>
{roleBadge[listing.sellerRole]}

// Payout column (demo: static)
<span>Balance: $0.00 · Last payout: —</span>
```

---

## 3. Ownership rules summary

| Who uploads | uploaderRole value | Can toggle allowDownload? | Appears in My Uploads? |
|-------------|-------------------|--------------------------|------------------------|
| Aircraft owner | `'owner'` | ✅ Yes | ✅ Yes |
| Mechanic | `'mechanic'` | ✅ Yes | ✅ Yes |
| Admin | `'admin'` | ✅ Yes | ✅ Yes |

- Ownership is **permanent** — does not transfer if user role changes.
- Only the uploader can delete or delist their own document.
- Admins can see all uploads in the moderation queue tab.

---

## 4. Build order (do these in sequence)

```
1. GAPS_1 — Documents modal disclosure text + ownership fields   (DocumentsPage.tsx)
2. GAPS_1 — Document row lock/unlock + uploader badge             (DocumentsPage.tsx)
3. GAPS_2 — Add 'upload' tab + 3 cards                           (MarketplacePage.tsx)
4. GAPS_2 — ManualUploadModal with all fields                     (MarketplacePage.tsx)
5. GAPS_2 — handleSubmitManualUpload + demo persistence           (MarketplacePage.tsx)
6. GAPS_2 — Community banner link → ?tab=upload                  (AppLayout.tsx)
7. GAPS_3 — My Uploads section in Settings                        (SettingsPage.tsx)
8. GAPS_3 — Seller Dashboard uploader identity                    (MarketplacePage.tsx)
```

---

## 🚫 DO NOT TOUCH — EVER

```
/app/(scanner)/*          — all scanner UI routes
/api/scanner/*            — all scanner API routes
src/scanner/capture       — getUserMedia capture screen
supabase/migrations/014+  — OCR and scanner DB migrations
src/app/components/workspace/ChatWorkspace.tsx
src/app/components/workspace/chatEngine.ts
src/app/components/workspace/ArtifactPanel.tsx
```
