// Frozen snapshot of the original hardcoded catalogue.
// This is the MIGRATION SEED ONLY, consumed by scripts/migrate-catalog.mjs.
// It is not imported by any route: the live catalogue is Firestore, read
// through lib/catalog-server.ts. Do not edit to change the storefront.

export const categories = [
  {
    id: "psyllium-husk",
    name: "Psyllium Husk",
    slug: "psyllium-husk",
    description: "Psyllium husk products for daily digestive fiber support.",
    image: "assets/images/products/isabgol-main.jpg"
  },
  {
    id: "vitamins-minerals",
    name: "Vitamins and Minerals",
    slug: "vitamins-minerals",
    description: "Vitamin and mineral formulations for everyday nutrition support.",
    image: "assets/images/products/c-cal-xt.png"
  },
  {
    id: "probiotics",
    name: "Probiotics",
    slug: "probiotics",
    description: "Probiotic products for routine digestive support.",
    image: "assets/images/products/sporcel.png"
  },
  {
    id: "protein",
    name: "Protein",
    slug: "protein",
    description: "Protein supplements for daily nutrition routines.",
    image: "assets/images/products/celepro.png"
  }
];

export const products = [
  {
    id: "p1",
    name: "Celera Naturals Isabgol | Psyllium Husk | 2 Packs of 100 gms",
    slug: "celera-naturals-isabgol-psyllium-husk-2x100g",
    category: "psyllium-husk",
    price: 375,
    originalPrice: 398,
    rating: 4.8,
    reviewCount: 128,
    image: "assets/images/products/isabgol-main.jpg",
    images: [
      "assets/images/products/isabgol-main.jpg",
      "assets/images/products/isabgol-alt.jpg",
      "https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1505575967455-40e256f73376?auto=format&fit=crop&w=1200&q=80"
    ],
    shortDescription: "Export quality psyllium husk for gentle, effective daily digestive support.",
    description: "A naturally sourced psyllium husk blend that helps support healthy bowel movement and overall digestive wellness.",
    benefits: ["Supports digestive regularity", "Helps relieve occasional constipation", "Gentle daily fiber support"],
    ingredients: ["Psyllium Husk"],
    availability: "in-stock",
    badge: "Best Seller"
  },
  {
    id: "p2",
    name: "CelD3 Vitamin D3 Capsules | Cholecalciferol 60,000 IU",
    slug: "celd3-vitamin-d3-capsules-60000-iu",
    category: "vitamins-minerals",
    price: 375,
    originalPrice: 398,
    rating: 4.7,
    reviewCount: 89,
    image: "assets/images/products/celd3.jpg",
    images: [
      "assets/images/products/celd3.jpg",
      "assets/images/products/c-cal-xt.png"
    ],
    shortDescription: "Vitamin D3 capsules for bone health and immunity support.",
    description: "High potency cholecalciferol softgels designed to support bone strength, calcium absorption and immunity.",
    benefits: ["High potency 60,000 IU support", "Supports bone, joint and muscle health", "WHO-GMP quality manufacturing"],
    ingredients: ["Cholecalciferol", "Softgel capsule shell"],
    availability: "in-stock",
    badge: "Sale"
  },
  {
    id: "p3",
    name: "SporCel Probiotic Capsules with LactoSpore (2 Billion CFU)",
    slug: "sporcel-probiotic-capsules-lactospore-2-billion-cfu",
    category: "probiotics",
    price: 550,
    originalPrice: 687,
    rating: 4.6,
    reviewCount: 64,
    image: "assets/images/products/sporcel.png",
    images: [
      "assets/images/products/sporcel.png"
    ],
    shortDescription: "Daily probiotic support formulated with LactoSpore for digestive microbiome balance.",
    description: "A focused probiotic capsule designed for digestion comfort, regular gut health and routine wellness support.",
    benefits: ["2 Billion CFU support", "LactoSpore-based probiotic profile", "Convenient daily capsule format"],
    ingredients: ["LactoSpore probiotic culture", "Capsule shell"],
    availability: "in-stock",
    badge: "New"
  },
  {
    id: "p4",
    name: "CELEPRO Advanced Protein and Multivitamin Supplement | 200 gms",
    slug: "celepro-advanced-protein-multivitamin-supplement-200g",
    category: "protein",
    price: 462,
    originalPrice: 578,
    rating: 4.5,
    reviewCount: 51,
    image: "assets/images/products/celepro.png",
    images: [
      "assets/images/products/celepro.png"
    ],
    shortDescription: "Protein and multivitamin wellness formula for everyday strength and nutrition support.",
    description: "A practical nutrition blend with protein and micronutrients crafted for modern, active routines.",
    benefits: ["Protein plus micronutrient support", "Balanced daily wellness profile", "Convenient scoop format"],
    ingredients: ["Protein blend", "Biotin", "DHA", "Calcium", "Iron"],
    availability: "in-stock",
    badge: "Featured"
  },
  {
    id: "p5",
    name: "C CAL-XT Coral Calcium and Vitamin D3 Tablets",
    slug: "c-cal-xt-coral-calcium-vitamin-d3-tablets",
    category: "vitamins-minerals",
    price: 350,
    originalPrice: 399,
    rating: 4.4,
    reviewCount: 33,
    image: "assets/images/products/c-cal-xt.png",
    images: ["assets/images/products/c-cal-xt.png"],
    shortDescription: "Coral calcium and vitamin D3 support for bone and mineral balance.",
    description: "A focused calcium wellness tablet profile designed for bone health support needs.",
    benefits: ["Supports bone strength", "Vitamin D3 and calcium synergy", "Daily tablet convenience"],
    ingredients: ["Coral calcium", "Vitamin D3"],
    availability: "in-stock",
    badge: ""
  },
  {
    id: "p6",
    name: "C Cal-Forte Advanced Bone Health Supplement",
    slug: "c-cal-forte-advanced-bone-health-supplement",
    category: "vitamins-minerals",
    price: 382,
    originalPrice: 447,
    rating: 4.6,
    reviewCount: 74,
    image: "assets/images/products/c-cal-forte.png",
    images: ["assets/images/products/c-cal-forte.png"],
    shortDescription: "Advanced calcitriol and calcium support for bone wellness routines.",
    description: "Formulated with calcium-focused nutrients for comprehensive bone and nerve support.",
    benefits: ["Bone and mineral support", "Calcitriol-based advanced profile", "Everyday use format"],
    ingredients: ["Calcitriol", "Calcium", "Vitamin B6", "Methylcobalamin", "Folic acid"],
    availability: "in-stock",
    badge: ""
  }
];
