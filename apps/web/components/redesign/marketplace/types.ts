export type PartCondition =
  | "New"
  | "New Surplus"
  | "Overhauled"
  | "Serviceable"
  | "As Removed"
  | "Used"
  | "For Repair";

export type ListingStatus = "Available" | "Pending" | "Sold" | "Draft";

export type SubscriptionPlan = "none" | "starter" | "pro";

export type MarketView =
  | "home"
  | "browse"
  | "detail"
  | "plans"
  | "create"
  | "dashboard"
  | "my-listings";

export type MarketMode = "parts" | "manuals";

export type ManualType = "maintenance manual" | "service manual" | "parts catalog";
export type ManualStatus = "published" | "draft" | "pending" | "rejected";

export interface ManualListing {
  id: string;
  price: number;
  status: ManualStatus;
  title: string;
  make: string;
  models: string;
  description: string;
  type: ManualType;
  pages: number;
  visibility: string;
  rating: number;
  reviews: number;
  revision: string;
  sellerId: string;
  sellerName: string;
  /** true = this user has already paid/obtained access */
  hasAccess?: boolean;
  /** true = already injected into a workspace */
  injectedAircraft?: string[];
}

export const MANUAL_LISTINGS: ManualListing[] = [
  {
    id: "ml-1",
    price: 50,
    status: "published",
    title: "Cessna 172SP Maintenance Manual",
    make: "Cessna",
    models: "172SP, 172S",
    description: "Community-supplied maintenance manual preview with attestation and payout-ready listing metadata.",
    type: "maintenance manual",
    pages: 214,
    visibility: "public discoverable",
    rating: 4.8,
    reviews: 2,
    revision: "Rev 12 / 2023",
    sellerId: "me",
    sellerName: "Mike Torres A&P",
    hasAccess: true,
    injectedAircraft: [],
  },
  {
    id: "ml-2",
    price: 50,
    status: "published",
    title: "Cessna 172S Service Manual",
    make: "Cessna",
    models: "172S, 172SP",
    description: "Marketplace listing for the Cessna 172S maintenance and service manual.",
    type: "service manual",
    pages: 186,
    visibility: "public discoverable",
    rating: 4.8,
    reviews: 1,
    revision: "Rev C",
    sellerId: "other",
    sellerName: "Blue Sky Avionics",
    hasAccess: false,
  },
  {
    id: "ml-3",
    price: 50,
    status: "published",
    title: "Cessna 172S Maintenance Manual Rev 12",
    make: "Cessna",
    models: "172S, 172SP",
    description: "Public maintenance manual listing seeded for the real marketplace flow.",
    type: "maintenance manual",
    pages: 312,
    visibility: "public discoverable",
    rating: 4.3,
    reviews: 1,
    revision: "Rev 12",
    sellerId: "other2",
    sellerName: "Cessna Specialists Inc.",
    hasAccess: false,
  },
  {
    id: "ml-4",
    price: 0,
    status: "published",
    title: "Cessna 172S IPC Rev 8",
    make: "Cessna",
    models: "172S, 172SP",
    description: "Free Illustrated parts catalog seed listing for ingest and enrichment testing.",
    type: "parts catalog",
    pages: 98,
    visibility: "public discoverable",
    rating: 4.8,
    reviews: 1,
    revision: "Rev 8",
    sellerId: "other3",
    sellerName: "Aircraft Spruce Community",
    hasAccess: true,
    injectedAircraft: [],
  },
  {
    id: "ml-5",
    price: 35,
    status: "published",
    title: "Lycoming IO-360 Overhaul Manual",
    make: "Lycoming",
    models: "IO-360-A, IO-360-B, IO-360-L",
    description: "Complete overhaul manual for the Lycoming IO-360 series. Includes torque specs, clearances, and all SB references.",
    type: "maintenance manual",
    pages: 278,
    visibility: "public discoverable",
    rating: 4.9,
    reviews: 4,
    revision: "3rd Ed / 2021",
    sellerId: "other4",
    sellerName: "Lycoming Specialists MRO",
    hasAccess: false,
  },
  {
    id: "ml-6",
    price: 0,
    status: "published",
    title: "Piper PA-28 Parts Catalog IPC",
    make: "Piper",
    models: "PA-28-151, PA-28-161, PA-28-181",
    description: "Free Piper Cherokee illustrated parts catalog. All part numbers, assemblies, and breakdowns.",
    type: "parts catalog",
    pages: 124,
    visibility: "public discoverable",
    rating: 4.5,
    reviews: 3,
    revision: "Rev 5",
    sellerId: "other5",
    sellerName: "Piper Owners Community",
    hasAccess: false,
    injectedAircraft: [],
  },
  {
    id: "ml-7",
    price: 45,
    status: "published",
    title: "Piper PA-28-181 Archer Service Manual",
    make: "Piper",
    models: "PA-28-181",
    description: "Complete service manual for the Piper Archer III. Covers all systems, inspection criteria, and maintenance procedures.",
    type: "service manual",
    pages: 301,
    visibility: "public discoverable",
    rating: 4.7,
    reviews: 5,
    revision: "Rev B / 2020",
    sellerId: "other6",
    sellerName: "Piper Specialists MRO",
    hasAccess: false,
  },
  {
    id: "ml-8",
    price: 0,
    status: "published",
    title: "Beechcraft Bonanza G36 IPC",
    make: "Beechcraft",
    models: "G36, A36, B36TC",
    description: "Free illustrated parts catalog for the Beechcraft Bonanza G36 series. All assemblies, ATA chapters, and cross-references included.",
    type: "parts catalog",
    pages: 188,
    visibility: "public discoverable",
    rating: 4.6,
    reviews: 2,
    revision: "Rev 4",
    sellerId: "other7",
    sellerName: "Bonanza Owners Group",
    hasAccess: false,
    injectedAircraft: [],
  },
  {
    id: "ml-9",
    price: 55,
    status: "published",
    title: "Continental IO-550 Overhaul Manual",
    make: "Continental",
    models: "IO-550-A, IO-550-B, IO-550-C, IO-550-N",
    description: "Comprehensive overhaul manual for Continental IO-550 series. Includes disassembly, inspection limits, reassembly, and run-in procedures.",
    type: "maintenance manual",
    pages: 342,
    visibility: "public discoverable",
    rating: 4.9,
    reviews: 7,
    revision: "2nd Ed / 2022",
    sellerId: "other8",
    sellerName: "Continental Engine Authority",
    hasAccess: false,
  },
];

export interface MarketListing {
  id: string;
  partNumber: string;
  altPartNumbers?: string[];
  title: string;
  manufacturer: string;
  category: string;
  subcategory?: string;
  condition: PartCondition;
  price: number;
  priceNegotiable?: boolean;
  quantity: number;
  location: string;
  description: string;
  applicability?: string;
  serialNumber?: string;
  traceAvailable: boolean;
  certTagAvailable: boolean;
  hasPhotos: boolean;
  sellerName: string;
  sellerType: "Owner" | "Mechanic" | "Shop" | "MRO";
  sellerPhone: string;
  sellerEmail: string;
  sellerVerified: boolean;
  status: ListingStatus;
  listedDate: string;
  viewCount: number;
  contactClicks: number;
  isMine: boolean;
  imageUrl?: string;
  featured?: boolean;
}

export interface PartCategory {
  id: string;
  label: string;
  icon: string;
  count: number;
  color: string;
  imageUrl?: string;
}

export const CATEGORIES: PartCategory[] = [
  { id: "engine",       label: "Engine",                  icon: "⚙️", count: 342, color: "bg-orange-50 border-orange-200", imageUrl: "https://images.unsplash.com/photo-1687283913429-d691fff3b466?w=400&q=80" },
  { id: "avionics",     label: "Avionics / Electrical",   icon: "📡", count: 218, color: "bg-blue-50 border-blue-200",   imageUrl: "https://images.unsplash.com/photo-1768579498362-8080c0c834d0?w=400&q=80" },
  { id: "propeller",    label: "Propeller / Rotor",       icon: "🌀", count: 89,  color: "bg-slate-50 border-slate-200", imageUrl: "https://images.unsplash.com/photo-1762208743487-11a4775c12f2?w=400&q=80" },
  { id: "landing-gear", label: "Landing Gear / Brakes",   icon: "🛞", count: 156, color: "bg-zinc-50 border-zinc-200",   imageUrl: "https://images.unsplash.com/photo-1692128236180-8d27c7e0a1d4?w=400&q=80" },
  { id: "interior",     label: "Interior / Cabin",        icon: "💺", count: 74,  color: "bg-amber-50 border-amber-200", imageUrl: "https://images.unsplash.com/photo-1764964048071-cc086ce9ab15?w=400&q=80" },
  { id: "instruments",  label: "Instruments / Panels",    icon: "🎛️", count: 131, color: "bg-indigo-50 border-indigo-200", imageUrl: "https://images.unsplash.com/photo-1581300907482-9ab70b31b69f?w=400&q=80" },
  { id: "fuel",         label: "Fuel / Oil / Hydraulic",  icon: "🔧", count: 97,  color: "bg-green-50 border-green-200", imageUrl: "https://images.unsplash.com/photo-1725916631310-4d7cdf815079?w=400&q=80" },
  { id: "electrical",   label: "Lighting / Electrical",   icon: "⚡", count: 63,  color: "bg-yellow-50 border-yellow-200", imageUrl: "https://images.unsplash.com/photo-1560700105-ef025fd710af?w=400&q=80" },
  { id: "airframe",     label: "Airframe / Doors",        icon: "✈️", count: 112, color: "bg-sky-50 border-sky-200",     imageUrl: "https://images.unsplash.com/photo-1764625433212-792495d15761?w=400&q=80" },
  { id: "hardware",     label: "Hardware / Fasteners",    icon: "🔩", count: 284, color: "bg-gray-50 border-gray-200",   imageUrl: undefined },
  { id: "safety",       label: "Safety / Emergency",      icon: "🚨", count: 41,  color: "bg-red-50 border-red-200",    imageUrl: undefined },
  { id: "misc",         label: "Miscellaneous",           icon: "📦", count: 203, color: "bg-purple-50 border-purple-200", imageUrl: undefined },
];

export const DEMO_LISTINGS: MarketListing[] = [];
