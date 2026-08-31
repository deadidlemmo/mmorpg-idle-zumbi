import { Controller, Get, Param, Query } from '@nestjs/common';
import { WikiCatalogQueryDto } from './dto/wiki-catalog-query.dto';
import { WikiSearchQueryDto } from './dto/wiki-search-query.dto';
import { WikiService } from './wiki.service';

@Controller('wiki')
export class WikiController {
  constructor(private readonly wikiService: WikiService) {}

  @Get('summary')
  getSummary() {
    return this.wikiService.getSummary();
  }

  @Get('search')
  search(@Query() query: WikiSearchQueryDto) {
    return this.wikiService.search(query.q);
  }

  @Get('items')
  listItems(@Query() query: WikiCatalogQueryDto) {
    return this.wikiService.listItems(query);
  }

  @Get('items/:slug')
  getItem(@Param('slug') slug: string) {
    return this.wikiService.getItem(slug);
  }

  @Get('monsters')
  listMonsters(@Query() query: WikiCatalogQueryDto) {
    return this.wikiService.listMonsters(query);
  }

  @Get('monsters/:slug')
  getMonster(@Param('slug') slug: string) {
    return this.wikiService.getMonster(slug);
  }

  @Get('maps')
  listMaps(@Query() query: WikiCatalogQueryDto) {
    return this.wikiService.listMaps(query);
  }

  @Get('maps/:slug')
  getMap(@Param('slug') slug: string) {
    return this.wikiService.getMap(slug);
  }

  @Get('bosses')
  listBosses(@Query() query: WikiCatalogQueryDto) {
    return this.wikiService.listBosses(query);
  }

  @Get('bosses/:slug')
  getBoss(@Param('slug') slug: string) {
    return this.wikiService.getBoss(slug);
  }
}
