import { createHash } from 'node:crypto';

/** Repair the exact pinned server filter; do not infer targets from occurrence IDs. */
export function prepareGitLabFootnoteFilter(source) {
  if (createHash('sha256').update(source).digest('hex') !== '3c3e2469ca0ce9191954f725548fa0bf3599ca9ccc8980b3fbdca46e14e1dc74')
    throw new Error('Inspect the pinned GitLab footnote filter before adapting it.');
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Inspect the pinned GitLab footnote filter boundary.');
    source = source.replace(before, after);
  };
  const from = source.indexOf('      def call\n');
  const to = source.indexOf('\n      private\n', from);
  if (from < 0 || to < 0 || source.indexOf('      def call\n', from + 1) >= 0)
    throw new Error('Inspect the pinned GitLab footnote call boundary.');
  source = source.slice(0, from) + `      def call
        return doc if doc.xpath(XPATH_FOOTNOTE).count > FOOTNOTE_LIMIT
        return doc unless section_node = doc.at_xpath(XPATH_SECTION)

        section_node.append_class('footnotes')
        rand_suffix = "-#{random_number}"
        definitions = doc.xpath(XPATH_SECTION).flat_map { |section| section.xpath('./ol/li[@id]').to_a }
          .each_with_object({}) { |node, index| index[node[:id]] ||= node }
        used_ids = doc.xpath('.//*[@id]').each_with_object({}) { |node, index| index[node[:id]] = true }
        modified_footnotes = {}

        doc.xpath(XPATH_FOOTNOTE).each do |link_node|
          next unless link_node[:id].to_s.start_with?(FOOTNOTE_LINK_ID_PREFIX) && link_node[:href].to_s.start_with?("##{FOOTNOTE_ID_PREFIX}")

          # Occurrence IDs may end in -2, -3, etc. The href owns the definition.
          footnote_node = definitions[link_node[:href].delete_prefix('#')]
          next unless footnote_node

          unless modified_footnotes[footnote_node.object_id]
            footnote_node[:id] = unique_footnote_id("#{footnote_node[:id]}#{rand_suffix}", used_ids)
            modified_footnotes[footnote_node.object_id] = true
          end

          original_reference_id = link_node[:id]
          link_node[:id] = unique_footnote_id("#{original_reference_id}#{rand_suffix}", used_ids)
          link_node[:href] = "##{footnote_node[:id]}"
          link_node.parent.append_class('footnote-ref')

          footnote_node.css('a[data-footnote-backref]').each do |backref_node|
            next unless backref_node[:href] == "##{original_reference_id}"

            backref_node[:href] = "##{link_node[:id]}"
            footnote_id = backref_node['data-footnote-backref-idx']
            backref_node[:title] = format(_("Back to reference %{footnote_id}"), footnote_id: footnote_id)
            backref_node['aria-label'] = backref_node[:title]
            backref_node.append_class('footnote-backref')
          end
        end

        doc
      end
` + source.slice(to);
  replace('      def random_number', `      def unique_footnote_id(base, used_ids)
        candidate = base
        index = 2
        while used_ids[candidate]
          candidate = "#{base}-#{index}"
          index += 1
        end
        used_ids[candidate] = true
        candidate
      end

      def random_number`);
  return source;
}
