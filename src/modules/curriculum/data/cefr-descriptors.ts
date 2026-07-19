// Sprint 26 Enhanced: Official CEFR descriptors
// Source: Council of Europe — CEFR Companion Volume (2020)
// https://www.coe.int/en/web/common-european-framework-reference-languages

import type { CEFRLevel } from '@/modules/knowledge-graph/types';

// ============================================
// Official CEFR Global Scale (Table 1, CEFR 3.3)
// Source: https://www.coe.int/en/web/common-european-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale
// ============================================

export interface CEFRGlobalDescriptor {
  level: CEFRLevel;
  category: 'Basic User' | 'Independent User' | 'Proficient User';
  description: string;
}

export const CEFR_GLOBAL_SCALE: CEFRGlobalDescriptor[] = [
  {
    level: 'C2', category: 'Proficient User',
    description: 'Can understand with ease virtually everything heard or read. Can summarise information from different spoken and written sources, reconstructing arguments and accounts in a coherent presentation. Can express him/herself spontaneously, very fluently and precisely, differentiating finer shades of meaning even in more complex situations.',
  },
  {
    level: 'C1', category: 'Proficient User',
    description: 'Can understand a wide range of demanding, longer texts, and recognise implicit meaning. Can express him/herself fluently and spontaneously without much obvious searching for expressions. Can use language flexibly and effectively for social, academic and professional purposes. Can produce clear, well-structured, detailed text on complex subjects, showing controlled use of organisational patterns, connectors and cohesive devices.',
  },
  {
    level: 'B2', category: 'Independent User',
    description: 'Can understand the main ideas of complex text on both concrete and abstract topics, including technical discussions in his/her field of specialisation. Can interact with a degree of fluency and spontaneity that makes regular interaction with native speakers quite possible without strain for either party. Can produce clear, detailed text on a wide range of subjects and explain a viewpoint on a topical issue giving the advantages and disadvantages of various options.',
  },
  {
    level: 'B1', category: 'Independent User',
    description: 'Can understand the main points of clear standard input on familiar matters regularly encountered in work, school, leisure, etc. Can deal with most situations likely to arise whilst travelling in an area where the language is spoken. Can produce simple connected text on topics which are familiar or of personal interest. Can describe experiences and events, dreams, hopes & ambitions and briefly give reasons and explanations for opinions and plans.',
  },
  {
    level: 'A2', category: 'Basic User',
    description: 'Can understand sentences and frequently used expressions related to areas of most immediate relevance (e.g. very basic personal and family information, shopping, local geography, employment). Can communicate in simple and routine tasks requiring a simple and direct exchange of information on familiar and routine matters. Can describe in simple terms aspects of his/her background, immediate environment and matters in areas of immediate need.',
  },
  {
    level: 'A1', category: 'Basic User',
    description: 'Can understand and use familiar everyday expressions and very basic phrases aimed at the satisfaction of needs of a concrete type. Can introduce him/herself and others and can ask and answer questions about personal details such as where he/she lives, people he/she knows and things he/she has. Can interact in a simple way provided the other person talks slowly and clearly and is prepared to help.',
  },
];

// ============================================
// CEFR "Can Do" Descriptors per Skill per Level
// Source: CEFR Companion Volume (2020) — illustrative descriptors
// ============================================

export type CEFRSkill = 'listening' | 'reading' | 'spoken-interaction' | 'spoken-production' | 'writing';

export interface CEFRCanDo {
  level: CEFRLevel;
  skill: CEFRSkill;
  descriptors: string[];
}

export const CEFR_CAN_DO_DESCRIPTORS: CEFRCanDo[] = [
  // === LISTENING ===
  { level: 'A1', skill: 'listening', descriptors: [
    'Can understand very simple phrases about people, places, and things when spoken slowly and clearly.',
    'Can follow speech which is very slow and carefully articulated, with long pauses to assimilate meaning.',
    'Can understand simple questions and instructions addressed carefully and slowly.',
  ]},
  { level: 'A2', skill: 'listening', descriptors: [
    'Can understand enough to meet needs of a concrete type, provided speech is clearly and slowly articulated.',
    'Can understand phrases and expressions related to areas of most immediate priority (e.g. personal/family info, shopping, local geography, employment).',
    'Can catch the main point in short, clear, simple messages and announcements.',
  ]},
  { level: 'B1', skill: 'listening', descriptors: [
    'Can understand the main points of clear standard speech on familiar matters regularly encountered in work, school, leisure, etc.',
    'Can understand the main point of many radio or TV programmes on current affairs or topics of personal interest when delivery is relatively slow and clear.',
    'Can follow a lecture or talk within his/her own field, provided the subject matter is familiar and the presentation is straightforward and clearly structured.',
  ]},
  { level: 'B2', skill: 'listening', descriptors: [
    'Can understand standard spoken language, live or broadcast, on both familiar and unfamiliar topics normally encountered in personal, social, academic or vocational life.',
    'Can understand the main ideas of propositionally and linguistically complex speech on both concrete and abstract topics.',
    'Can follow extended speech and complex lines of argument provided the topic is reasonably familiar.',
  ]},
  { level: 'C1', skill: 'listening', descriptors: [
    'Can understand enough to follow extended speech on abstract and complex topics beyond his/her own field.',
    'Can recognise a wide range of idiomatic expressions and colloquialisms, appreciating register shifts.',
    'Can follow extended speech even when it is not clearly structured and when relationships are only implied and not signalled explicitly.',
  ]},
  { level: 'C2', skill: 'listening', descriptors: [
    'Can understand with ease virtually any kind of spoken language, whether live or broadcast, even when delivered at fast native speed.',
    'Can understand any native speaker, even on abstract and complex topics of a specialist nature beyond his/her own field.',
  ]},

  // === READING ===
  { level: 'A1', skill: 'reading', descriptors: [
    'Can understand very short, simple texts a single phrase at a time, picking up familiar names, words and basic phrases.',
    'Can get an idea of the content of simpler informational material and short simple descriptions, especially if there is visual support.',
  ]},
  { level: 'A2', skill: 'reading', descriptors: [
    'Can understand short, simple texts on familiar matters of a concrete type which consist of high frequency everyday or job-related language.',
    'Can understand short, simple texts containing the highest frequency vocabulary, including a proportion of shared international vocabulary items.',
    'Can find specific, predictable information in simple everyday material such as advertisements, prospectuses, menus and timetables.',
  ]},
  { level: 'B1', skill: 'reading', descriptors: [
    'Can read straightforward factual texts on subjects related to his/her field and interest with a satisfactory level of comprehension.',
    'Can understand the description of events, feelings and wishes in personal letters.',
    'Can recognise the main conclusions in clearly signalled argumentative texts.',
  ]},
  { level: 'B2', skill: 'reading', descriptors: [
    'Can read with a large degree of independence, adapting style and speed of reading to different texts and purposes.',
    'Can obtain information, ideas and opinions from highly specialised sources within his/her field.',
    'Can understand articles and reports concerned with contemporary problems in which the writers adopt particular stances or viewpoints.',
  ]},
  { level: 'C1', skill: 'reading', descriptors: [
    'Can understand in detail lengthy, complex texts, whether or not they relate to his/her own area of speciality.',
    'Can understand in detail a wide range of lengthy, complex texts likely to be encountered in social, professional or academic life.',
    'Can appreciate subtle distinctions of style, implicit as well as explicit meaning.',
  ]},
  { level: 'C2', skill: 'reading', descriptors: [
    'Can understand and interpret critically virtually all forms of the written language including abstract, structurally complex, or highly colloquial literary and non-literary writings.',
    'Can understand a wide range of long and complex texts, appreciating subtle distinctions of style and implicit as well as explicit meaning.',
  ]},

  // === SPOKEN INTERACTION ===
  { level: 'A1', skill: 'spoken-interaction', descriptors: [
    'Can interact in a simple way but communication is totally dependent on repetition, rephrasing and repair.',
    'Can ask and answer simple questions, initiate and respond to simple statements in areas of immediate need or on very familiar topics.',
  ]},
  { level: 'A2', skill: 'spoken-interaction', descriptors: [
    'Can communicate in simple and routine tasks requiring a simple and direct exchange of information on familiar topics and activities.',
    'Can handle very short social exchanges, even though he/she can\'t usually understand enough to keep the conversation going.',
  ]},
  { level: 'B1', skill: 'spoken-interaction', descriptors: [
    'Can exploit a wide range of simple language to deal with most situations likely to arise whilst travelling.',
    'Can enter unprepared into conversation on topics that are familiar, of personal interest or pertinent to everyday life.',
    'Can express and respond to feelings such as surprise, happiness, sadness, interest and indifference.',
  ]},
  { level: 'B2', skill: 'spoken-interaction', descriptors: [
    'Can interact with a degree of fluency and spontaneity that makes regular interaction with native speakers quite possible.',
    'Can account for and sustain his/her opinions in discussion by providing relevant explanations, arguments and comments.',
    'Can take an active part in informal discussion in familiar contexts, commenting, putting point of view clearly.',
  ]},
  { level: 'C1', skill: 'spoken-interaction', descriptors: [
    'Can express him/herself fluently and spontaneously, almost effortlessly.',
    'Can use language flexibly and effectively for social and professional purposes.',
    'Can formulate ideas and opinions with precision and relate his/her contribution skillfully to those of other speakers.',
  ]},
  { level: 'C2', skill: 'spoken-interaction', descriptors: [
    'Can take part effortlessly in any conversation or discussion and have a good familiarity with idiomatic expressions and colloquialisms.',
    'Can express him/herself fluently and convey finer shades of meaning precisely.',
    'Can backtrack and restructure around a difficulty so smoothly the interlocutor is hardly aware of it.',
  ]},

  // === SPOKEN PRODUCTION ===
  { level: 'A1', skill: 'spoken-production', descriptors: [
    'Can produce simple mainly isolated phrases about people and places.',
    'Can give short, basic descriptions of events and activities.',
  ]},
  { level: 'A2', skill: 'spoken-production', descriptors: [
    'Can give a simple description or presentation of people, living or working conditions, daily routines, likes/dislikes, etc.',
    'Can describe past activities and personal experiences using simple language.',
  ]},
  { level: 'B1', skill: 'spoken-production', descriptors: [
    'Can reasonably fluently sustain a straightforward description of one of a variety of subjects within his/her field of interest.',
    'Can give straightforward descriptions on a variety of familiar subjects within his/her field of interest.',
    'Can briefly give reasons and explanations for opinions and plans.',
  ]},
  { level: 'B2', skill: 'spoken-production', descriptors: [
    'Can give clear, detailed descriptions on a wide range of subjects related to his/her field of interest.',
    'Can develop a clear argument, expanding and supporting his/her points of view with subsidiary points and relevant examples.',
    'Can present a topical issue in a critical manner, weighing up advantages and disadvantages.',
  ]},
  { level: 'C1', skill: 'spoken-production', descriptors: [
    'Can give clear, detailed descriptions and presentations on complex subjects, integrating sub-themes, developing particular points and rounding off with an appropriate conclusion.',
    'Can give elaborate descriptions and narratives, integrating sub-themes, developing particular points and rounding off.',
  ]},
  { level: 'C2', skill: 'spoken-production', descriptors: [
    'Can produce clear, smoothly flowing, well-structured speech with an effective logical structure which helps the recipient to notice and remember significant points.',
    'Can present a complex topic confidently and articulately to an audience unfamiliar with it, structuring and adapting the talk flexibly to meet the audience\'s needs.',
  ]},

  // === WRITING ===
  { level: 'A1', skill: 'writing', descriptors: [
    'Can write simple isolated phrases and sentences.',
    'Can write a short simple postcard, for example sending holiday greetings.',
    'Can fill in forms with personal details, for example entering name, nationality and address on a hotel registration form.',
  ]},
  { level: 'A2', skill: 'writing', descriptors: [
    'Can write a series of simple phrases and sentences linked with simple connectors like "and", "but" and "because".',
    'Can write short, simple formulaic notes and messages relating to matters in areas of immediate need.',
    'Can write very simple personal letters expressing thanks and apology.',
  ]},
  { level: 'B1', skill: 'writing', descriptors: [
    'Can write straightforward connected text on topics which are familiar or of personal interest.',
    'Can write personal letters describing experiences and impressions.',
    'Can write short, simple essays on topics of interest, summarising and giving his/her opinion.',
  ]},
  { level: 'B2', skill: 'writing', descriptors: [
    'Can write clear, detailed text on a wide range of subjects related to his/her interests.',
    'Can write an essay or report, passing on information or giving reasons in support of or against a particular point of view.',
    'Can write letters highlighting the personal significance of events and experiences.',
  ]},
  { level: 'C1', skill: 'writing', descriptors: [
    'Can write clear, well-structured text on complex subjects, underlining the relevant salient issues, expanding and supporting points of view.',
    'Can express him/herself with clarity and precision, relating to the addressee flexibly and effectively.',
    'Can write clear, detailed, well-structured and developed descriptions and imaginative texts in an assured, personal, natural style.',
  ]},
  { level: 'C2', skill: 'writing', descriptors: [
    'Can write clear, smoothly flowing, complex texts in an appropriate and effective style and a logical structure which helps the reader find significant points.',
    'Can write complex stories or articles which present a case, or give critical appreciation of proposals or literary works.',
  ]},
];

// ============================================
// Helper: Get descriptors for a specific level + skill
// ============================================

export function getCEFRDescriptors(level: CEFRLevel, skill: CEFRSkill): string[] {
  const entry = CEFR_CAN_DO_DESCRIPTORS.find(d => d.level === level && d.skill === skill);
  return entry?.descriptors ?? [];
}

/** Get all "Can Do" descriptors for a level across all 5 skills */
export function getCEFRLevelProfile(level: CEFRLevel): Record<CEFRSkill, string[]> {
  const skills: CEFRSkill[] = ['listening', 'reading', 'spoken-interaction', 'spoken-production', 'writing'];
  const profile = {} as Record<CEFRSkill, string[]>;
  for (const skill of skills) {
    profile[skill] = getCEFRDescriptors(level, skill);
  }
  return profile;
}
