import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { UpdateUserSuspensionDto } from './dto/update-user-suspension.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('summary')
  getSummary() {
    return this.adminService.getSummary();
  }

  @Get('operations')
  getOperations() {
    return this.adminService.getOperations();
  }

  @Get('users')
  listUsers(@Query() query: ListAdminUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/suspension')
  updateSuspension(
    @Req() request: { user: { id: string } },
    @Param('id') userId: string,
    @Body() dto: UpdateUserSuspensionDto,
  ) {
    return this.adminService.updateSuspension(request.user.id, userId, dto);
  }

  @Get('audit-logs')
  listAuditLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listAuditLogs(
      Number(page) || 1,
      Number(pageSize) || 50,
    );
  }
}
