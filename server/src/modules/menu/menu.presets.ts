export interface PresetMenuItem {
  name: string;
  pricePaise: number;
  category: string;
  emojiIcon: string;
  colorHex: string;
  isVeg: boolean;
}

export const STREET_MENU_PRESETS: Record<string, { label: string; items: PresetMenuItem[] }> = {
  chai_nashta: {
    label: 'Chai, Samosa & Nashta Corner',
    items: [
      { name: 'Special Masala Chai', pricePaise: 1500, category: 'Beverages', emojiIcon: '☕', colorHex: '#d97706', isVeg: true },
      { name: 'Hyderabadi Irani Chai', pricePaise: 2000, category: 'Beverages', emojiIcon: '☕', colorHex: '#b45309', isVeg: true },
      { name: 'Punjabi Aloo Samosa (1 pc)', pricePaise: 1500, category: 'Snacks', emojiIcon: '🥟', colorHex: '#eab308', isVeg: true },
      { name: 'Bun Maska', pricePaise: 3500, category: 'Snacks', emojiIcon: '🍞', colorHex: '#ca8a04', isVeg: true },
      { name: 'Osmania Biscuits (4 pcs)', pricePaise: 1500, category: 'Snacks', emojiIcon: '🍪', colorHex: '#a16207', isVeg: true },
      { name: 'Crispy Mirchi Bajji (2 pcs)', pricePaise: 2500, category: 'Snacks', emojiIcon: '🌶️', colorHex: '#ef4444', isVeg: true },
      { name: 'Poha with Sev & Peanuts', pricePaise: 3500, category: 'Breakfast', emojiIcon: '🥣', colorHex: '#f59e0b', isVeg: true },
    ],
  },
  momos_chinese: {
    label: 'Momos & Street Chinese Counter',
    items: [
      { name: 'Veg Steamed Momos (6 pcs)', pricePaise: 6000, category: 'Momos', emojiIcon: '🥟', colorHex: '#10b981', isVeg: true },
      { name: 'Chicken Steamed Momos (6 pcs)', pricePaise: 8000, category: 'Momos', emojiIcon: '🥟', colorHex: '#ef4444', isVeg: false },
      { name: 'Veg Fried Momos (6 pcs)', pricePaise: 7000, category: 'Momos', emojiIcon: '🥟', colorHex: '#f59e0b', isVeg: true },
      { name: 'Chicken Fried Momos (6 pcs)', pricePaise: 9000, category: 'Momos', emojiIcon: '🥟', colorHex: '#dc2626', isVeg: false },
      { name: 'Chicken Kurkure Momos (5 pcs)', pricePaise: 12000, category: 'Momos', emojiIcon: '🥟', colorHex: '#b91c1c', isVeg: false },
      { name: 'Veg Hakka Noodles', pricePaise: 8000, category: 'Fast Food', emojiIcon: '🍜', colorHex: '#059669', isVeg: true },
      { name: 'Chicken Hakka Noodles', pricePaise: 11000, category: 'Fast Food', emojiIcon: '🍜', colorHex: '#ea580c', isVeg: false },
      { name: 'Chicken Manchurian Dry', pricePaise: 13000, category: 'Fast Food', emojiIcon: '🍲', colorHex: '#991b1b', isVeg: false },
    ],
  },
  chaat_panipuri: {
    label: 'Pani Puri & Chaat Cart',
    items: [
      { name: 'Pani Puri (6 pcs)', pricePaise: 3000, category: 'Chaat', emojiIcon: '🥣', colorHex: '#16a34a', isVeg: true },
      { name: 'Sev Puri (6 pcs)', pricePaise: 4000, category: 'Chaat', emojiIcon: '🍘', colorHex: '#d97706', isVeg: true },
      { name: 'Dahi Puri (6 pcs)', pricePaise: 5000, category: 'Chaat', emojiIcon: '🥣', colorHex: '#2563eb', isVeg: true },
      { name: 'Papdi Chaat', pricePaise: 5000, category: 'Chaat', emojiIcon: '🥗', colorHex: '#0d9488', isVeg: true },
      { name: 'Aloo Tikki Chaat', pricePaise: 6000, category: 'Chaat', emojiIcon: '🥔', colorHex: '#ca8a04', isVeg: true },
      { name: 'Samosa Chaat (2 pcs)', pricePaise: 6000, category: 'Chaat', emojiIcon: '🥟', colorHex: '#ea580c', isVeg: true },
    ],
  },
  south_indian: {
    label: 'South Indian Tiffin & Filter Coffee',
    items: [
      { name: 'Steamed Idli (2 pcs) with Chutney', pricePaise: 3000, category: 'Tiffin', emojiIcon: '⚪', colorHex: '#64748b', isVeg: true },
      { name: 'Crispy Medu Vada (2 pcs)', pricePaise: 3500, category: 'Tiffin', emojiIcon: '🍩', colorHex: '#d97706', isVeg: true },
      { name: 'Golden Plain Dosa', pricePaise: 4500, category: 'Dosa', emojiIcon: '🥞', colorHex: '#ca8a04', isVeg: true },
      { name: 'Masala Dosa with Aloo Palya', pricePaise: 6000, category: 'Dosa', emojiIcon: '🥞', colorHex: '#eab308', isVeg: true },
      { name: 'Ghee Roast Dosa', pricePaise: 8000, category: 'Dosa', emojiIcon: '🥞', colorHex: '#b45309', isVeg: true },
      { name: 'South Indian Filter Coffee', pricePaise: 2000, category: 'Beverages', emojiIcon: '☕', colorHex: '#78350f', isVeg: true },
    ],
  },
  rolls_shawarma: {
    label: 'Kathi Rolls & Shawarma Joint',
    items: [
      { name: 'Kolkata Veg Roll', pricePaise: 6000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#10b981', isVeg: true },
      { name: 'Paneer Tikka Roll', pricePaise: 9000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#059669', isVeg: true },
      { name: 'Single Egg Roll', pricePaise: 5000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#f59e0b', isVeg: false },
      { name: 'Double Egg Chicken Roll', pricePaise: 11000, category: 'Rolls', emojiIcon: '🌯', colorHex: '#dc2626', isVeg: false },
      { name: 'Chicken Shawarma Roll', pricePaise: 9000, category: 'Shawarma', emojiIcon: '🥙', colorHex: '#b91c1c', isVeg: false },
      { name: 'Chicken Shawarma Plate (Rumali)', pricePaise: 14000, category: 'Shawarma', emojiIcon: '🍽️', colorHex: '#991b1b', isVeg: false },
    ],
  },
  beverages_juice: {
    label: 'Fresh Juice, Shakes & Lassi Stall',
    items: [
      { name: 'Fresh Sugarcane Juice (Nimbu/Adrak)', pricePaise: 3000, category: 'Fresh Juice', emojiIcon: '🥤', colorHex: '#84cc16', isVeg: true },
      { name: 'Sweet Lime (Mosambi) Juice', pricePaise: 5000, category: 'Fresh Juice', emojiIcon: '🍊', colorHex: '#facc15', isVeg: true },
      { name: 'Chilled Mango Shake', pricePaise: 6000, category: 'Shakes', emojiIcon: '🥭', colorHex: '#f97316', isVeg: true },
      { name: 'Cold Badam Milk', pricePaise: 4000, category: 'Milk', emojiIcon: '🥛', colorHex: '#fcd34d', isVeg: true },
      { name: 'Sweet Punjabi Lassi', pricePaise: 4000, category: 'Lassi', emojiIcon: '🥛', colorHex: '#38bdf8', isVeg: true },
      { name: 'Fresh Lime Soda (Sweet/Salt)', pricePaise: 3000, category: 'Soda', emojiIcon: '🍋', colorHex: '#a3e635', isVeg: true },
    ],
  },
};
