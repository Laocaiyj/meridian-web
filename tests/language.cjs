const names = { en: 'English', zh: '中文', ja: '日本語', ko: '한국어' };
exports.selectLanguage = async (page, language) => {
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: names[language], exact: true }).click();
};
