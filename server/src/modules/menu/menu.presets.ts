export interface PresetMenuItem {
  name: string;
  pricePaise: number;
  category: string;
  emojiIcon: string;
  colorHex: string;
}

export const STREET_MENU_PRESETS: Record<string, { label: string; items: PresetMenuItem[] }> = {
  chai_nashta: {
    label: 'Chai, Samosa & Nashta Corner',
    items: [
      { name: 'Special Masala Chai', pricePaise: 1500, category: 'Beverages', emojiIcon: '☕', colorHex: '#d97706' },
      { name: 'Hyderabadi Irani Chai', pricePaise: 2000, category: 'Beverages', emojiIcon: '☕', colorHex: '#b45309' },
      { name: 'Punjabi Aloo Samosa (1 pc)', pricePaise: 1500, category: 'Snacks', emojiIcon: '🥟', colorHex: '#eab308' },
      { name: 'Bun Maska', pricePaise: 3500, category: 'Snacks', emojiIcon: '🍞', colorHex: '#ca8a04' },
      { name: 'Osmania Biscuits (4 pcs)', pricePaise: 1500, category: 'Snacks', emojiIcon: '🍪', colorHex: '#a16207' },
      { name: 'Crispy Mirchi Bajji (2 pcs)', pricePaise: 2500, category: 'Snacks', emojiIcon: '🌶️', colorHex: '#ef4444' },
      { name: 'Poha with Sev & Peanuts', pricePaise: 3500, category: 'Breakfast', emojiIcon: '🥣', colorHex: '#f59e0b' },
    ],
  },
  momos_chinese: {
    label: 'Momos & Street Chinese Counter',
    items: [
      { name: 'Veg Steamed Momos (6 pcs)', pricePaise: 6000, category: 'Momos', emojiIcon: '🥟', colorHex: '#10b981' },
      { name: 'Chicken Steamed Momos (6 pcs)', pricePaise: 8000, category: 'Momos', emojiIcon: '🥟', colorHex: '#ef4444' },
      { name: 'Veg Fried Momos (6 pcs)', pricePaise: 7000, category: 'Momos', emojiIcon: '🥟', colorHex: '#f59e0b' },
      { name: 'Chicken Fried Momos (6 pcs)', pricePaise: 9000, category: 'Momos', emojiIcon: '🥟', colorHex: '#dc2626' },
      { name: 'Chicken Kurkure Momos (5 pcs)', pricePaise: 12000, category: 'Momos', emojiIcon: '🥟', colorHex: '#b91c1c' },
      { name: 'Veg Hakka Noodles', pricePaise: 8000, category: 'Fast Food', emojiIcon: '🍜', colorHex: '#059669' },
      { name: 'Chicken Hakka Noodles', pricePaise: 11000, category: 'Fast Food', emojiIcon: '🍜', colorHex: '#ea580c' },
      { name: 'Chicken Manchurian Dry', pricePaise: 13000, category: 'Fast Food', emojiIcon: '🍲', colorHex: '#991b1b' },
    ],
  },
  chaat_panipuri: {
    label: 'Pani Puri & Chaat Cart',
    items: [
      { name: 'Pani Puri (6 pcs)', pricePaise: 3000, category: 'Chaat', emojiIcon: '🥣', colorHex: '#16a34a' },
      { name: 'Sev Puri (6 pcs)', pricePaise: 4000, category: 'Chaat', emojiIcon: '🍘', colorHex: '#d97706' },
      { name: 'Dahi Puri (6 pcs)', pricePaise: 5000, category: 'Chaat', emojiIcon: '🥣', colorHex: '#2563eb' },
      { name: 'Papdi Chaat', pricePaise: 5000, category: 'Chaat', emojiIcon: '🥗', colorHex: '#0d9488' },
      { name: 'Aloo Tikki Chaat', pricePaise: 6000, category: 'Chaat', emojiIcon: '🥔', colorHex: '#ca8a04' },
      { name: 'Samosa Chaat (2 pcs)', pricePaise: 6000, category: 'Chaat', emojiIcon: '🥟', colorHex: '#ea580c' },
    ],
  },
  south_indian: {
    label: 'South Indian Tiffin & Filter Coffee',
    items: [
      { name: 'Steamed Idli (2 pcs) with Chutney', pricePaise: 3000, category: 'Tiffin', emojiIcon: '⚪', colorHex: '#64748b' },
      { name: 'Crispy Medu Vada (2 pcs)', pricePaise: 3500, category: 'Tiffin', emojiIcon: '🍩', colorHex: '#d97706' },
      { name: 'Golden Plain Dosa', pricePaise: 4500, category: 'Dosa', emojiIcon: '🥞', colorHex: '#ca8a04' },
      { name: 'Masala Dosa with Aloo Palya', pricePaise: 6000, category: 'Dosa', emojiIcon: '🥞', colorHex: '#eab308' },
      { name: 'Ghee Roast Dosa', pricePaise: 8000, category: 'Dosa', emojiIcon: '🥞', colorHex: '#b45309' },
      { name: 'South Indian Filter Coffee', pricePaise: 2000, category: 'Beverages', emojiIcon: '☕', colorHex: '#78350f' },
    ],
  },
  rolls_shawarma: {
    label: 'Kathi Rolls & Shawarma Joint',
    items: [
      { name: 'Kolkata Veg Roll', pricePaise: 6000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#10b981' },
      { name: 'Paneer Tikka Roll', pricePaise: 9000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#059669' },
      { name: 'Single Egg Roll', pricePaise: 5000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#f59e0b' },
      { name: 'Double Egg Chicken Roll', pricePaise: 11000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#dc2626' },
      { name: 'Chicken Shawarma Roll', pricePaise: 9000, category: 'Shawarma', emojiIcon: '🥙', colorHex: '#b91c1c' },
      { name: 'Chicken Shawarma Plate (Rumali)', pricePaise: 14000, category: 'Shawarma', emojiIcon: '🍽️', colorHex: '#991b1b' },
    ],
  },
  beverages_juice: {
    label: 'Fresh Juice, Shakes & Lassi Stall',
    items: [
      { name: 'Fresh Sugarcane Juice (Nimbu/Adrak)', pricePaise: 3000, category: 'Fresh Juice', emojiIcon: '🥤', colorHex: '#84cc16' },
      { name: 'Sweet Lime (Mosambi) Juice', pricePaise: 5000, category: 'Fresh Juice', emojiIcon: '🍊', colorHex: '#facc15' },
      { name: 'Chilled Mango Shake', pricePaise: 6000, category: 'Shakes', emojiIcon: '🥭', colorHex: '#f97316' },
      { name: 'Cold Badam Milk', pricePaise: 4000, category: 'Milk', emojiIcon: '🥛', colorHex: '#fcd34d' },
      { name: 'Sweet Punjabi Lassi', pricePaise: 4000, category: 'Lassi', emojiIcon: '🥛', colorHex: '#38bdf8' },
      { name: 'Fresh Lime Soda (Sweet/Salt)', pricePaise: 3000, category: 'Soda', emojiIcon: '🍋', colorHex: '#a3e635' },
    ],
  },
};
