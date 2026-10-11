/**
 * Data Science & AI Employment Pack (data-science-pack)
 * Covers Kaggle, Hugging Face, research citations, and machine learning platforms.
 */

import type { EmploymentPack } from '../types';

export const DATA_SCIENCE_PACK: EmploymentPack = {
  id: 'data-science-pack',
  name: 'Data Science & Machine Learning',
  discipline: 'Data & AI',
  icon: '🔬',
  version: '1.0.0',
  description: 'Kaggle rankings, Hugging Face models, Google Scholar citations, and research papers.',
  maintainer: 'Private Apply Community',
  isCustom: false,
  fields: [
    {
      id: 'ds_kaggle',
      key: 'kaggle_url',
      label: 'Kaggle Profile',
      category: 'Competitions & Datasets',
      dataType: 'url',
      aliases: [
        'kaggle',
        'kaggle profile',
        'kaggle url',
        'kaggle competitions',
        'kaggle rank',
      ],
      placeholder: 'https://www.kaggle.com/username',
      helpText: 'Kaggle Grandmaster/Master ranking, notebooks, and dataset contributions.',
      sensitivity: 'ordinary',
    },
    {
      id: 'ds_huggingface',
      key: 'huggingface_url',
      label: 'Hugging Face Profile',
      category: 'Model Repositories',
      dataType: 'url',
      aliases: [
        'huggingface',
        'hugging face',
        'huggingface profile',
        'hugging face url',
        'hf profile',
      ],
      placeholder: 'https://huggingface.co/username',
      helpText: 'Hugging Face model hub and Spaces demo repository.',
      sensitivity: 'ordinary',
    },
    {
      id: 'ds_scholar',
      key: 'google_scholar_url',
      label: 'Google Scholar Profile',
      category: 'Research & Publications',
      dataType: 'url',
      aliases: [
        'google scholar',
        'scholar profile',
        'scholar url',
        'citations profile',
        'publications profile',
      ],
      placeholder: 'https://scholar.google.com/citations?user=USER_ID',
      helpText: 'Google Scholar citation index and academic publications.',
      sensitivity: 'ordinary',
    },
    {
      id: 'ds_papers',
      key: 'papers_url',
      label: 'arXiv / Papers With Code',
      category: 'Research & Publications',
      dataType: 'url',
      aliases: [
        'arxiv',
        'papers with code',
        'paperswithcode',
        'research publications url',
      ],
      placeholder: 'https://arxiv.org/a/author_id or https://paperswithcode.com/u/user',
      helpText: 'arXiv author identifier or Papers With Code profile.',
      sensitivity: 'ordinary',
    },
    {
      id: 'ds_frameworks',
      key: 'ml_frameworks',
      label: 'Primary ML/Data Frameworks',
      category: 'Technical Stack',
      dataType: 'text',
      aliases: [
        'ml frameworks',
        'machine learning stack',
        'data science tools',
        'pytorch tensorflow',
      ],
      placeholder: 'PyTorch, TensorFlow, JAX, HuggingFace Transformers, Pandas, Ray, vLLM',
      helpText: 'Primary machine learning, deep learning, and data engineering frameworks.',
      sensitivity: 'ordinary',
    },
  ],
};
