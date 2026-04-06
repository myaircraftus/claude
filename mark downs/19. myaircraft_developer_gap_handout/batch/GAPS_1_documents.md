# myaircraft.us — Gap Fix 1: Documents Upload Modal
> File: `src/app/components/DocumentsPage.tsx`
> ⚠️ ADD ONLY. Do not remove or rename existing fields.
> 🚫 DO NOT touch scanner, OCR pipeline, or ChatWorkspace.

---

## 1. Add to `UploadForm` type
```ts
uploaderRole: 'owner' | 'mechanic' | 'admin'
allowDownload: boolean        // default: false
communityListing: boolean     // true when manualAccess = 'free' | 'paid'
```

## 2. Disclosure text block
Show this **below** the Manual Access toggle — only when `docType` is `"Maintenance Manual" | "Service Manual" | "Parts Catalog"`:

```tsx
{isManualType && (
  <p className="text-xs text-muted-foreground mt-2 p-2 bg-amber-50 rounded">
    Manuals, service manuals, and parts catalogs can stay private or become
    community downloads. Paid listings follow the requested 50% uploader /
    50% myaircraft.us split.
  </p>
)}
```

## 3. Field order in modal (enforce this sequence)
1. Document Title *(required)*
2. Visibility toggle — **"Private"** / **"Shared with team"** *(fix label from "Team")*
3. Aircraft *(optional dropdown)*
4. Notes *(optional textarea)*
5. Document Type *(select)*
6. Book Assignment Type — **Historical / Present** *(non-manual types only)*
7. Manual Access — **Private / Free Download / Paid** *(manual types only)*
   - 7a. ★ Disclosure text block *(see §2 above)*
8. Price input *(paid only)*
9. Revenue preview *(paid only — existing 50/50 formula)*
10. Attestation checkbox *(free/paid only)*
11. File upload

## 4. `handleSubmit` additions
```ts
// Capture at submit time — do not ask user for these
const ownership = {
  uploaderRole: session.user.role,   // from auth session
  allowDownload: false,
  communityListing: ['free','paid'].includes(form.manualAccess),
}
// Merge into document record before save
```

## 5. Document list row additions
```tsx
// Show to ALL org members
<span>{doc.uploaderId === currentUser.id ? 'You' : doc.uploaderName}</span>

// Show ONLY to uploader (doc.uploaderId === currentUser.id)
<button onClick={() => updateDoc(doc.id, { allowDownload: !doc.allowDownload })}>
  {doc.allowDownload ? <Unlock /> : <Lock />}
</button>

// Show to others ONLY when allowDownload = true
{doc.allowDownload && doc.uploaderId !== currentUser.id && <Download />}

// Show when communityListing = true
{doc.communityListing && (
  <span>{doc.manualAccess === 'free' ? 'Community • Free' : `Community • $${doc.price}`}</span>
)}
```
