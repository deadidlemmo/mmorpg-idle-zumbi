import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_EDITORIAL_PAGES,
  WIKI_GUIDES,
  WIKI_PET_BONUSES,
  WIKI_PET_TIER_BONUSES,
  WIKI_SYSTEM_PAGES,
  getSystemPage,
  searchEditorialPages,
} from "./wikiEditorialContent";

test("mantém slugs editoriais únicos e páginas de sistema resolvíveis", () => {
  const slugs = ALL_EDITORIAL_PAGES.map((page) => page.slug);
  assert.equal(new Set(slugs).size, slugs.length);

  for (const page of WIKI_SYSTEM_PAGES) {
    assert.equal(getSystemPage(page.slug)?.title, page.title);
    assert.ok(page.sections.length > 0);
    assert.ok(page.summary.length > 20);
  }
});

test("mantém a terminologia de equipamentos clara nos textos editoriais", () => {
  const editorialText = JSON.stringify(ALL_EDITORIAL_PAGES);

  assert.doesNotMatch(editorialText, /\bconjunto\b/i);
  assert.match(
    JSON.stringify(getSystemPage("equipamentos-e-reforco")),
    /Fragmentos de Reforço/,
  );
});

test("resume os fluxos centrais sem esconder os requisitos importantes", () => {
  assert.match(
    JSON.stringify(getSystemPage("combate-automatico")),
    /6 horas.*12 horas/,
  );
  assert.match(
    JSON.stringify(getSystemPage("expedicoes")),
    /seis especializações/i,
  );
  assert.match(
    JSON.stringify(getSystemPage("ameacas-globais")),
    /inscrição não interrompe/i,
  );
});

test("explica diretamente como melhorar equipamentos e conseguir pets", () => {
  const betterEquipment = WIKI_GUIDES.find(
    (guide) => guide.question === "Como consigo um equipamento melhor?",
  );
  const reinforcement = WIKI_GUIDES.find(
    (guide) => guide.question === "Como reforço meu equipamento?",
  );
  const pet = WIKI_GUIDES.find(
    (guide) => guide.question === "Como consigo um pet?",
  );

  assert.match(betterEquipment?.answer ?? "", /Criação/);
  assert.match(betterEquipment?.answer ?? "", /Mercado do Abrigo/);
  assert.match(reinforcement?.answer ?? "", /Incursões/);
  assert.match(reinforcement?.answer ?? "", /Equipamentos/);
  assert.match(reinforcement?.answer ?? "", /até \+3 e não falha/);
  assert.match(pet?.answer ?? "", /Ameaças Globais/);
  assert.match(pet?.answer ?? "", /casulo/);
  assert.match(pet?.answer ?? "", /resgate e equipe o pet/);
});

test("lista todas as especializações e forças de bônus dos pets", () => {
  assert.equal(WIKI_PET_BONUSES.length, 8);
  assert.deepEqual(
    WIKI_PET_BONUSES.map((bonus) => bonus.label),
    [
      "Desmanche",
      "Coleta",
      "Patrulha",
      "Arsenal",
      "Tecnovarredura",
      "Contenção",
      "Combate automático",
      "Rastreamento",
    ],
  );
  assert.deepEqual(
    WIKI_PET_TIER_BONUSES.map((bonus) => bonus.percent),
    [3, 4, 5, 6, 7.5],
  );
});

test("pesquisa editorial aceita acentos e correspondências parciais", () => {
  assert.ok(
    searchEditorialPages("pocao").some((page) => page.slug === "pocoes"),
  );
  assert.ok(
    searchEditorialPages("ameaça").some(
      (page) => page.slug === "ameacas-globais",
    ),
  );
  assert.ok(
    searchEditorialPages("onde consigo pocao").some(
      (page) => page.slug === "pocoes",
    ),
  );
  assert.ok(
    searchEditorialPages("pocoe").some((page) => page.slug === "pocoes"),
  );
  assert.equal(searchEditorialPages("pocoe")[0]?.slug, "pocoes");
  assert.deepEqual(searchEditorialPages("x"), []);
});
