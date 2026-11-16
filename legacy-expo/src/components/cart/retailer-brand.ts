import { type ImageSource } from 'expo-image';

import { BeavyColors as C } from '@/constants/theme';

export type RetailerBrandStyle = {
  barColor: string;
  softTint: string;
  textColor: string;
  shortCode: string;
  shortName: string;
  logoSource?: ImageSource;
  isFullBleedLogo?: boolean;
};

const FRESHFUL_LOGO = require('@/assets/retailers/freshful.png');
const CARREFOUR_LOGO = require('@/assets/retailers/carrefour.png');
const MEGA_IMAGE_LOGO = require('@/assets/retailers/mega-image.png');
const AUCHAN_LOGO = require('@/assets/retailers/auchan.png');
const KAUFLAND_LOGO = require('@/assets/retailers/kaufland.png');
const LIDL_LOGO = require('@/assets/retailers/lidl.png');
const SEZAMO_LOGO = require('@/assets/retailers/sezamo.png');
const PENNY_LOGO = require('@/assets/retailers/penny.png');

const MEGA_STYLE: RetailerBrandStyle = {
  barColor: '#D61F26',
  softTint: '#FCEAEB',
  textColor: '#B8161C',
  shortCode: 'MI',
  shortName: 'Mega Image',
  logoSource: MEGA_IMAGE_LOGO,
  isFullBleedLogo: false,
};

const RETAILER_BRAND_TABLE: Record<string, RetailerBrandStyle> = {
  freshful: {
    barColor: '#0B7A43',
    softTint: '#E6F5ED',
    textColor: '#0B7A43',
    shortCode: 'FR',
    shortName: 'Freshful',
    logoSource: FRESHFUL_LOGO,
    isFullBleedLogo: false,
  },
  carrefour: {
    barColor: '#004E9E',
    softTint: '#E6EFF8',
    textColor: '#004E9E',
    shortCode: 'CF',
    shortName: 'Carrefour',
    logoSource: CARREFOUR_LOGO,
    isFullBleedLogo: false,
  },
  'mega-image': MEGA_STYLE,
  'mega image': MEGA_STYLE,
  mega: MEGA_STYLE,
  auchan: {
    barColor: '#9E1B32',
    softTint: '#F9E8EC',
    textColor: '#9E1B32',
    shortCode: 'AU',
    shortName: 'Auchan',
    logoSource: AUCHAN_LOGO,
    isFullBleedLogo: false,
  },
  kaufland: {
    barColor: '#C8102E',
    softTint: '#FCEAEB',
    textColor: '#A60D26',
    shortCode: 'KL',
    shortName: 'Kaufland',
    logoSource: KAUFLAND_LOGO,
    isFullBleedLogo: false,
  },
  lidl: {
    barColor: '#0050AA',
    softTint: '#E6EEF8',
    textColor: '#0050AA',
    shortCode: 'LI',
    shortName: 'Lidl',
    logoSource: LIDL_LOGO,
    isFullBleedLogo: true,
  },
  sezamo: {
    barColor: '#1F7A3E',
    softTint: '#EAF6EE',
    textColor: '#1F7A3E',
    shortCode: 'SZ',
    shortName: 'Sezamo',
    logoSource: SEZAMO_LOGO,
    isFullBleedLogo: false,
  },
  profi: {
    barColor: '#C62828',
    softTint: '#FCEAEB',
    textColor: '#A61F1F',
    shortCode: 'PR',
    shortName: 'Profi',
  },
  penny: {
    barColor: '#CC001B',
    softTint: '#FCE8EB',
    textColor: '#A80016',
    shortCode: 'PN',
    shortName: 'Penny',
    logoSource: PENNY_LOGO,
    isFullBleedLogo: true,
  },
};

export function getRetailerBrandStyle(
  retailerName: string,
  slug?: string | null
): RetailerBrandStyle {
  const bySlug = slug ? RETAILER_BRAND_TABLE[slug.trim().toLowerCase()] : undefined;
  if (bySlug) return bySlug;

  const byName = RETAILER_BRAND_TABLE[retailerName.trim().toLowerCase()];
  if (byName) return byName;

  const shortCode = retailerName.trim().slice(0, 2).toUpperCase() || 'MG';
  return {
    barColor: C.primary,
    softTint: C.secondary,
    textColor: C.primary,
    shortCode,
    shortName: retailerName,
  };
}
