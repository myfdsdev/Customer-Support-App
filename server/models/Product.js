'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9][a-z0-9-]*$/, 'Slug may only contain lowercase letters, numbers and hyphens'],
      index: true,
    },
    logo: { type: String, default: '' },
    description: { type: String, default: '', maxlength: 2000 },
    tagline: { type: String, default: '', maxlength: 200 },
    websiteUrl: { type: String, default: '' },
    loginUrl: { type: String, default: '' },
    docsUrl: { type: String, default: '' },
    supportEmail: { type: String, default: '' },
    brandColor: { type: String, default: '#4f46e5' },
    aiWelcomeMessage: {
      type: String,
      default: 'Hi! I can help with setup, features, billing and troubleshooting. What do you need help with?',
      maxlength: 1000,
    },
    aiPersona: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.pre('validate', function ensureSlug(next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  } else if (this.slug) {
    this.slug = slugify(this.slug, { lower: true, strict: true });
  }
  next();
});

productSchema.virtual('supportUrl').get(function supportUrl() {
  return `/support/${this.slug}`;
});

module.exports = mongoose.model('Product', productSchema);
