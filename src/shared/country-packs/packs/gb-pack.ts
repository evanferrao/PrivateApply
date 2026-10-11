import type { CountryPack } from '../types';

export const GB_PACK: CountryPack = {
  id: 'GB-pack',
  countryCode: 'GB',
  countryName: 'United Kingdom',
  icon: '🇬🇧',
  version: '1.0.0',
  description: 'United Kingdom recruitment requirements: National Insurance (NI) Number and Home Office Right to Work Share Code.',
  maintainer: 'PrivateApply Team',
  fields: [
    {
      id: 'gb_ni_number',
      key: 'gb_ni_number',
      label: 'National Insurance (NI) Number',
      dataType: 'masked_identifier',
      placeholder: 'QQ 12 34 56 A',
      validationRegex: '^[A-CEGHJ-PR-TW-Z]{1}[A-CEGHJ-NPR-TW-Z]{1}[0-9]{6}[A-D]{1}$',
      aliases: ['national insurance number', 'ni number', 'nino', 'uk ni', 'national insurance'],
      helpText: 'Official UK National Insurance number used for taxation and state benefits.',
      sensitivity: 'restricted_identifier',
    },
    {
      id: 'gb_share_code',
      key: 'gb_share_code',
      label: 'UK Right to Work Share Code',
      dataType: 'text',
      placeholder: 'e.g. 9XY-123-ABC',
      aliases: ['right to work share code', 'share code', 'uk share code', 'home office share code', 'right to work code'],
      helpText: '9-character alphanumeric code generated on gov.uk allowing UK employers to verify immigration status.',
      sensitivity: 'ordinary',
    },
  ],
};
