# myaircraft.us — Gap Fix 2: Marketplace Upload Manuals Tab
> File: `src/app/components/MarketplacePage.tsx`
> ⚠️ ADD ONLY. Existing Browse / Seller / Moderation tabs stay unchanged.

---

## 1. Extend tab type
```ts
// Change:
tab: 'browse' | 'seller' | 'moderation'
// To:
tab: 'browse' | 'seller' | 'moderation' | 'upload'
```

## 2. Add new state
```ts
showUploadManual: 'maintenance' | 'service' | 'parts' | null  // default: null
manualUploadSuccess: boolean  // default: false

interface ManualUploadForm {
  docType: 'Maintenance manual' | 'Service manual' | 'Parts catalog' // locked per card
  title: string        // required
  make: string         // required
  model: string        // required
  revision: string
  description: string
  pdfFile: string
  accessLevel: 'private' | 'free' | 'paid'
  price: string
  launchMode: 'publish' | 'draft'
  attest1: boolean
  attest2: boolean
  attest3: boolean
}
```

## 3. Tab bar — add 4th button
```tsx
<button onClick={() => setTab('upload')}>Upload manuals</button>
```

## 4. Upload Manuals tab body
Render when `tab === 'upload'`. Show 3 cards side by side:

| Card | Label | Button |
|------|-------|--------|
| A | Maintenance Manual | `onClick={() => setShowUploadManual('maintenance')}` |
| B | Service Manual | `onClick={() => setShowUploadManual('service')}` |
| C | Parts Catalog | `onClick={() => setShowUploadManual('parts')}` |

Each card has a short description + upload button.

## 5. Modal fields (shared, docType pre-set per card)
1. docType badge *(locked, display only)*
2. Listing Title *(required)*
3. Make *(required)* / Model *(required)*
4. Revision *(optional)* / Description *(optional)*
5. PDF upload *(required)*
6. **Access Level toggle: Private | Free Download | Paid**
7. ★ **Disclosure text** — always below access toggle:
   ```
   Manuals, service manuals, and parts catalogs can stay private or become
   community downloads. Paid listings follow the requested 50% uploader /
   50% myaircraft.us split.
   ```
8. Price input *(paid only)*
9. Revenue preview *(paid only — same 50/50 formula as existing Publish modal)*
10. Launch mode toggle *(free/paid only)*
11. Attestations ×3 *(free/paid only)*

## 6. `canSubmit` logic
```ts
const canSubmit =
  form.title.trim() && form.make.trim() && form.model.trim() && form.pdfFile &&
  (form.accessLevel === 'private' || (form.attest1 && form.attest2 && form.attest3))
```

## 7. `handleSubmitManualUpload`
```ts
// 1. setManualUploadSuccess(true)
// 2. Attach uploader: { uploaderId, uploaderName, uploaderRole } from session
// 3. After 2500ms: reset form, setShowUploadManual(null)
// 4. Demo: push to LISTINGS array
// TODO backend: POST /api/marketplace/listings — PDF to S3, create DB record
// Status: accessLevel=private → 'private'; free/paid + launchMode=publish → 'pending review'; draft → 'draft'
```

## 8. Community button in demo banner (AppLayout.tsx)
```tsx
// Change the Community link to:
<Link to="/app/marketplace?tab=upload">Community</Link>

// In MarketplacePage, read on mount:
const [params] = useSearchParams()
useEffect(() => {
  if (params.get('tab') === 'upload') setTab('upload')
}, [])
```
