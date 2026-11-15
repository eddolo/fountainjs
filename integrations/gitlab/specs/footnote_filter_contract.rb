# frozen_string_literal: true

require 'bundler/setup'
require 'html/pipeline'
require 'gitlab/utils/nokogiri'
require 'json'

# Only deadline accounting and translation are omitted in these standalone
# structural contracts. The filter, HTML::Pipeline and Nokogiri are real.
module Banzai
  module Filter
    module Concerns
      module PipelineTimingCheck; end
    end
  end
end

def _(text)
  text
end

def assert(value, message)
  raise message unless value
end

def element(doc, name, attributes = {}, text = nil)
  node = Nokogiri::XML::Node.new(name, doc.document)
  attributes.each { |key, value| node[key] = value }
  node.content = text if text
  node
end

def fixture(specs, reserved = [])
  doc = Nokogiri::HTML.fragment('')
  root = element(doc, 'div')
  doc.add_child(root)
  reserved.each { |id| root.add_child(element(doc, 'span', { 'id' => id }, 'Authored target.')) }
  section = element(doc, 'section', { 'data-footnotes' => '' })
  list = element(doc, 'ol')
  specs.each_with_index do |(label, count), index|
    paragraph = element(doc, 'p', {}, 'Visible body.')
    definition = element(doc, 'li', { 'id' => "fn-#{label}" })
    definition.add_child(element(doc, 'p', {}, "Retained definition #{index + 1}."))
    count.times do |occurrence|
      id = "fnref-#{label}#{occurrence.zero? ? '' : "-#{occurrence + 1}"}"
      sup = element(doc, 'sup')
      sup.add_child(element(doc, 'a', { 'id' => id, 'href' => "#fn-#{label}", 'data-footnote-ref' => '' }, (index + 1).to_s))
      paragraph.add_child(sup)
      key = "#{index + 1}#{occurrence.zero? ? '' : "-#{occurrence + 1}"}"
      definition.add_child(element(doc, 'a', { 'href' => "##{id}", 'data-footnote-backref' => '',
        'data-footnote-backref-idx' => key }, '↩'))
    end
    root.add_child(paragraph)
    list.add_child(definition)
  end
  section.add_child(list)
  root.add_child(section)
  doc
end

def apply(path, doc)
  Banzai::Filter.send(:remove_const, :FootnoteFilter) if Banzai::Filter.const_defined?(:FootnoteFilter, false)
  load path
  Banzai::Filter::FootnoteFilter.new(doc).call
end

original, patched = ARGV
ENV['GITLAB_TEST_FOOTNOTE_ID'] = '4242'
witness = apply(original, fixture([['alpha', 3]]))
ids = witness.xpath('.//*[@id]').map { |node| node['id'] }
broken = witness.css('sup > a[data-footnote-ref]').filter_map { |link| link['href'] unless ids.include?(link['href'].delete_prefix('#')) }
assert(broken.length == 2, 'The pinned parent must reproduce both broken repeated forward links.')

cases = ['alpha', 'a-2', 'a.b:c%41', '研究', 'non%20breaking', 'a"b', 'a\\b'].product([1, 2, 3]).map { |label, count| [[label, count]] }
cases.concat([[['a', 2], ['a-2', 1]], [['a', 2], ['a-4242', 1]]])
passed = 0
cases.each do |specs|
  doc = fixture(specs, ['fn-alpha-4242', 'fnref-alpha-4242'])
  text = doc.text
  result = apply(patched, doc)
  assert(result.text == text, 'The repair must not change authored text or note bodies.')
  result_ids = result.xpath('.//*[@id]').map { |node| node['id'] }
  assert(result_ids.uniq.length == result_ids.length, 'The repair introduced duplicate IDs.')
  result.css('sup > a[data-footnote-ref]').each do |link|
    assert(result_ids.count(link['href'].delete_prefix('#')) == 1, 'A forward reference has no unique destination.')
    assert(link.parent['class'].split.include?('footnote-ref'), 'A repeated reference lost its reader class.')
  end
  result.css('a[data-footnote-backref]').each do |link|
    assert(result_ids.count(link['href'].delete_prefix('#')) == 1, 'A backlink has no unique reference destination.')
    assert(link['aria-label'] == "Back to reference #{link['data-footnote-backref-idx']}", 'A backlink lost its accessible label.')
  end
  passed += 1
end

limit = fixture([['over-limit', 1001]])
unchanged = limit.to_html
assert(apply(patched, limit).to_html == unchanged, 'The original 1000-reference processing limit must remain unchanged.')
passed += 1
puts JSON.generate({ status: 'passed', cases: passed, parent_broken_targets: broken,
  scope: 'Standalone filter contracts using the pinned image gems; real Rails rendering and browser navigation require separate acceptance.' })
